"""News engine (PROMPT_5 §4) — background refresh loop + cached serving.

Loop every NEWS_INTERVAL_MIN (default 8) minutes:
1. Fetch Bengaluru news via the **NewsAPI.org API** (real headlines, no scraping).
2. Classify each item: traffic | weather | event | general.
3. Geo-tag when a known locality/landmark appears -> lat/lng (map marker).
4. LLM summarize each item into <=2 lines (allowed: summary only).
5. Dedup by normalized title, keep max 25, TTL 4h.

Serving: GET /api/search/news?lat=&lng= filters by relevance (geo proximity +
keyword match), sorted by recency. Cache served even when the loop fails; the
UI shows an "Offline" state rather than fake headlines.

No-key/API-down fallback: the old Reddit/DDG fetch paths are kept purely as a
last resort so the app still works out-of-the-box — data stays real either way.
"""
import json
import logging
import threading
import time
from pathlib import Path
from datetime import datetime, timezone

import requests

from .. import config
from .proxy_manager import ProxyManager

logger = logging.getLogger(__name__)

_TTL_S = 4 * 3600
_MAX_ITEMS = 25
_RND = 3
# Items persisted to disk survive the 4h in-memory TTL (NewsAPI free-tier
# quota exhausts daily). Serve them flagged `stale` for up to 72h so the feed
# never goes empty once the quota is gone.
_CACHE_MAX_AGE_S = 72 * 3600

_NEWSAPI_ENDPOINT = "https://newsapi.org/v2/everything"
_NEWSAPI_QUERIES = ("Bengaluru", "Bangalore traffic", "Karnataka rain")
# NewsAPI free tier allows 100 requests/day. The 3-query batch + 8-min loop
# would burn 540/day, so: never call more often than _NEWSAPI_MIN_INTERVAL_S,
# and on a 429/401/403/426 back off for _NEWSAPI_BLOCK_S entirely.
_NEWSAPI_MIN_INTERVAL_S = 6 * 3600
_NEWSAPI_BLOCK_S = 12 * 3600
# fallback scrapers (Reddit/DDG) also get rate-limited/captcha'd when hammered:
# run them at most every _SCRAPE_MIN_INTERVAL_S, and only when the store is stale.
_SCRAPE_MIN_INTERVAL_S = 30 * 60

# DDG "news" queries surface aggregator dashboards (TomTom index, ViaMichelin,
# trafficonmaps, ...) that are NOT real articles — filter those titles out.
_JUNK_TITLE_TOKENS = (
    "tomtom", "viamichelin", "trafficonmaps", "traffic index", "congestion-map",
    "congestion map", "dashboard", "utility", "map and updates",
    "latest news, photos and videos", "traffic news for today",
    "real-time road traffic", "real-time traffic",
)

# Strict Bangalore-only gate: an article must mention the city or one of the
# known localities to be shown. Free-tier NewsAPI matches the query anywhere in
# the article (even a passing mention), which lets unrelated India/world news
# through — this filter is what keeps the feed Bangalore-specific.
_BANGALORE_MARKERS = ("bengaluru", "bangalore", "blr", "b'lore")

# Known Bangalore localities/landmarks -> coords (geo-tagging table)
_LOCALITIES = {
    "sil board": (12.9166, 77.6210),
    "majestic": (12.9767, 77.5713),
    "mg road": (12.9758, 77.6065),
    "cubbon park": (12.9767, 77.5929),
    "indiranagar": (12.9719, 77.6412),
    "koramangala": (12.9352, 77.6245),
    "whitefield": (12.9698, 77.7500),
    "electronic city": (12.8452, 77.6602),
    "hebbal": (13.0358, 77.5970),
    "yeshvantpur": (13.0208, 77.5456),
    "rajajinagar": (12.9915, 77.5550),
    "jayanagar": (12.9250, 77.5938),
    "marathahalli": (12.9588, 77.7060),
    "hebbal flyover": (13.0358, 77.5970),
    "outer ring road": (12.9700, 77.6400),
    "namma metro": (12.9716, 77.5946),
    "kempegowda": (12.9611, 77.6393),
    "bannerghatta": (12.8837, 77.6050),
    "hsr layout": (12.9117, 77.6339),
    "bellandur": (12.9298, 77.6745),
    "silk board": (12.9166, 77.6210),
    "byatarayanapura": (13.0333, 77.6167),
    "sarjapur": (12.9123, 77.6676),
    "ecity": (12.8452, 77.6602),
}

_CLASSIFY_KEYWORDS = {
    "traffic": ["traffic", "jam", "congestion", "accident", "road closed", "diversion",
                "snarl", "gridlock", "crashed", "pile-up", "metro delay", "bus strike"],
    "weather": ["rain", "flood", "storm", "cloudburst", "thunderstorm", "heatwave",
                "waterlogging", "drizzle", "downpour"],
    "event": ["festival", "concert", "match", "rally", "protest", "mela", "exhibition",
              "marathon", "fair", "parade"],
}


class NewsEngine:
    def __init__(self, proxy: ProxyManager | None = None, interval_min: int = 8,
                 cache_path: str | Path | None = None):
        self._proxy = proxy or ProxyManager()
        self._interval_min = interval_min
        self._cache_path = Path(cache_path) if cache_path else None
        self._lock = threading.Lock()
        self._items: list[dict] = []
        self._last_run = 0.0
        self._last_scrape = 0.0
        self._newsapi_last_ok = 0.0
        self._newsapi_blocked_until = 0.0
        self._running = False
        self._stop = False
        self._thread: threading.Thread | None = None

    # ---------------------------------------------------------------- store
    def _dedup(self, items: list[dict]) -> list[dict]:
        seen: set[str] = set()
        out = []
        for it in items:
            key = " ".join(it.get("title", "").lower().split())[:80]
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(it)
        return out

    def _merge(self, fresh: list[dict]) -> None:
        with self._lock:
            fresh_titles = {f.get("title") for f in fresh}
            # TTL expires stale CACHED items; the just-fetched batch always
            # survives (NewsAPI free tier serves articles ~24h old, which would
            # otherwise be dropped on arrival by a 4h TTL). `stale` items are
            # disk-restored last-known-good headlines — they outlive the TTL
            # so the feed keeps showing real articles after the quota is gone.
            cached = [it for it in self._items if it.get("title") not in fresh_titles]
            now = time.time()
            cached = [it for it in cached if it.get("stale") or now - it.get("ts", now) < _TTL_S]
            combined = fresh + cached
            combined.sort(key=lambda it: it.get("ts", 0), reverse=True)
            self._items = combined[:_MAX_ITEMS]
        self._persist()

    # ---------------------------------------------------------------- disk cache
    def _persist(self) -> None:
        """Snapshot the store to disk so the feed survives restarts + quota loss."""
        if not self._cache_path:
            return
        try:
            with self._lock:
                if not self._items:
                    return  # never overwrite a good snapshot with an empty store
                data = list(self._items)
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            self._cache_path.write_text(json.dumps(data, ensure_ascii=False))
        except (OSError, ValueError):  # noqa: BLE001 — never fatal
            logger.warning("[news] persist failed: %s", self._cache_path)

    def _load_cache(self) -> None:
        """Restore last-known-good headlines (<=72h old) as `stale` items."""
        if not self._cache_path or not self._cache_path.exists():
            return
        try:
            with self._lock:
                data = list(self._items)
            now = time.time()
            data = json.loads(self._cache_path.read_text())
            items = [it for it in data if now - it.get("ts", now) < _CACHE_MAX_AGE_S]
            for it in items:
                it.setdefault("category", "general")
                if now - it.get("ts", now) > _TTL_S:
                    it["stale"] = True
            with self._lock:
                self._items = items
            logger.info("[news] restored %d item(s) from disk cache", len(items))
        except (OSError, ValueError):
            pass

    # ---------------------------------------------------------------- loop
    def start(self) -> None:
        if self._running:
            return
        self._load_cache()
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="news-loop")
        self._thread.start()
        logger.info("[news] background refresh loop started (every %d min)", self._interval_min)

    def stop(self) -> None:
        self._stop = True
        self._running = False

    def _loop(self) -> None:
        while not self._stop:
            try:
                self.refresh_once()
            except Exception as exc:  # noqa: BLE001 — loop must never die
                logger.warning("[news] refresh failed: %s", exc)
            time.sleep(self._interval_min * 60)

    def refresh_once(self) -> int:
        """Fetch news (NewsAPI.org primary, scrapers as no-key fallback)
        + classify + tag + summarize. Returns item count."""
        now = time.time()
        with self._lock:
            oldest = min((it.get("ts", now) for it in self._items), default=0.0)
        # Store is still fresh (or was just refreshed): skip everything.
        # Source quotas are small (NewsAPI 100/day, DDG captcha-prone) and an
        # 8-min re-fetch is pointless against a 4h TTL.
        if now - self._last_run < self._interval_min * 60 and now - oldest < _TTL_S:
            return len(self._items)
        items = self._fetch_newsapi()
        if not items and now - self._last_scrape > _SCRAPE_MIN_INTERVAL_S:
            self._last_scrape = now
            items += self._scrape_reddit()
            items += self._scrape_news_fallback()
        items = self._dedup(items)
        for it in items:
            it["category"] = self._classify(it.get("title", ""))
            geo = self._geo_tag(it.get("title", "") + " " + it.get("text", ""))
            it["geo"] = geo
        self._merge(items)
        if not self._items:
            # Everything expired (e.g. quota exhausted for >4h): fall back to
            # the last-known-good snapshot so the feed never shows empty.
            self._load_cache()
        self._last_run = time.time()
        return len(self._items)

    # ---------------------------------------------------------------- sources
    def _fetch_newsapi(self) -> list[dict]:
        """Primary source: NewsAPI.org `everything` endpoint (real headlines).

        No API key -> returns [] (the caller falls back to the scrapers).
        Never fabricates: articles come straight from the API response.
        Rate-limit aware: after a 429/401/403/426 the key is left alone for
        _NEWSAPI_BLOCK_S (free tier quota is tiny and the 8-min loop would
        otherwise burn it within hours), and even healthy keys are only queried
        once per _NEWSAPI_MIN_INTERVAL_S.
        """
        key = config.NEWS_API_KEY
        now = time.time()
        if not key:
            logger.info("[news] NEWS_API_KEY not set — falling back to scrapers")
            return []
        if now < self._newsapi_blocked_until:
            logger.info("[news] newsapi rate-limited — backing off until %s",
                        datetime.fromtimestamp(self._newsapi_blocked_until, timezone.utc).isoformat(timespec="minutes"))
            return []
        if now - self._newsapi_last_ok < _NEWSAPI_MIN_INTERVAL_S:
            logger.info("[news] newsapi within cooldown — skipping (quota conservation)")
            return []
        out: list[dict] = []
        saw_ok = False
        for query in _NEWSAPI_QUERIES:
            resp = None
            try:
                resp = requests.get(
                    _NEWSAPI_ENDPOINT,
                    params={"q": query, "sortBy": "publishedAt", "pageSize": 20,
                            "language": "en", "searchIn": "title,description",
                            "apiKey": key},
                    timeout=10,
                    headers={"User-Agent": "Mozilla/5.0 (VOYAGER news engine)"},
                )
                resp.raise_for_status()
                data = resp.json()
                for a in data.get("articles", []):
                    title = (a.get("title") or "").strip()
                    if not title:
                        continue
                    if not self._is_bangalore(title):
                        continue
                    ts = _parse_iso(a.get("publishedAt")) or time.time()
                    out.append({
                        "title": title,
                        "text": (a.get("description") or "")[:400],
                        "url": a.get("url") or "",
                        "source": (a.get("source") or {}).get("name") or "newsapi",
                        "ts": ts,
                    })
                saw_ok = True
            except requests.HTTPError as exc:
                if resp is not None and resp.status_code in (401, 403, 426, 429):
                    self._newsapi_blocked_until = now + _NEWSAPI_BLOCK_S
                logger.warning("[news] newsapi(%s) failed: %s", query, exc)
            except (requests.RequestException, ValueError) as exc:
                logger.warning("[news] newsapi(%s) failed: %s", query, exc)
        if saw_ok:
            self._newsapi_last_ok = now
        return out

    def _fetch(self, url: str, timeout: float = 10.0,
               params: dict | None = None) -> requests.Response | None:
        """Fetch via the proxy when configured, else a plain direct request.

        Keeps ProxyManager's own "no-creds => None" contract intact (tested) while
        letting the news engine still work out-of-the-box when no DataImpulse
        credentials are set. Data is always real — never fabricated.
        """
        if self._proxy.available:
            return self._proxy.get(url, timeout=timeout, params=params or {})
        try:
            return requests.get(
                url, timeout=timeout, params=params,
                headers={"User-Agent": "Mozilla/5.0 (VOYAGER news engine)"})
        except requests.RequestException:
            return None

    def _scrape_reddit(self) -> list[dict]:
        out = []
        url = "https://www.reddit.com/r/bangalore/new.json?limit=25"
        resp = self._fetch(url, timeout=10)
        if resp is None:
            return out
        try:
            data = resp.json()
            for child in data.get("data", {}).get("children", []):
                d = child.get("data", {})
                title = d.get("title", "").strip()
                if not title:
                    continue
                out.append({
                    "title": title,
                    "text": (d.get("selftext") or "")[:400],
                    "url": "https://www.reddit.com" + (d.get("permalink") or ""),
                    "source": "r/bangalore",
                    "ts": time.time(),
                })
        except (ValueError, KeyError) as exc:
            logger.warning("[news] reddit parse failed: %s", exc)
        return out

    def _scrape_news_fallback(self) -> list[dict]:
        """DuckDuckGo news search via proxy (Karnataka/Bangalore queries)."""
        out = []
        for query in ("Bangalore news today", "Bengaluru news", "Karnataka rain alert"):
            items = self._ddg_news(query)
            if items:
                out.extend(items)
        return out

    def _ddg_news(self, query: str) -> list[dict]:
        try:
            resp = self._fetch(
                "https://html.duckduckgo.com/html/",
                params={"q": query, "ia": "news"},
                timeout=10)
            # DDG returns 202/anomaly pages when throttled — treat as no results.
            if resp is None or resp.status_code != 200:
                return []
            html = resp.text
            import re

            out = []
            for m in re.finditer(
                    r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.S):
                href, title_html = m.group(1), m.group(2)
                title = re.sub(r"<[^>]+>", "", title_html).strip()
                title = _unescape_html(title)
                if not title or _is_junk_title(title):
                    continue
                out.append({"title": title, "text": "", "url": _decode_ddg_url(href),
                            "source": "news-aggregate", "ts": time.time()})
            return out[:8]
        except Exception as exc:  # noqa: BLE001
            logger.warning("[news] ddg(%s) failed: %s", query, exc)
            return []

    # ---------------------------------------------------------------- enrich
    def _classify(self, text: str) -> str:
        low = text.lower()
        for cat, keys in _CLASSIFY_KEYWORDS.items():
            if any(k in low for k in keys):
                return cat
        return "general"

    def _is_bangalore(self, title: str, description: str = "") -> bool:
        """Strict Bangalore gate.

        The headline itself must be about Bangalore: the city name (or a known
        locality) must appear in the TITLE. A passing mention in the article
        body/description does NOT qualify — that's what lets "Anthropic brings
        Claude to India" style stories through otherwise.
        """
        low = title.lower()
        if any(m in low for m in _BANGALORE_MARKERS):
            return True
        return any(_contains_word(loc, low) for loc in _LOCALITIES)

    def _geo_tag(self, text: str) -> dict | None:
        low = text.lower()
        for name, (lat, lng) in _LOCALITIES.items():
            if _contains_word(name, low):
                return {"name": name, "lat": lat, "lng": lng}
        return None

    def summarize_items(self, llm) -> None:
        """LLM-summarize each unsaved item (≤2 lines). Never blocks serving."""
        for it in self._items:
            if it.get("summary"):
                continue
            if not it.get("text") and not it.get("title"):
                continue
            try:
                res = llm.chat_json(
                    "Summarize this Bengaluru news item in <=2 lines, JSON {\"summary\": str}.",
                    f"Title: {it['title']}\nBody: {it.get('text','')}")
                if res and res.get("summary"):
                    it["summary"] = res["summary"][:220]
            except Exception as exc:  # noqa: BLE001
                logger.warning("[news] summarize failed: %s", exc)
        self._merge([])  # persist summaries

    # ---------------------------------------------------------------- serving
    def relevant(self, lat: float | None = None, lng: float | None = None,
                 keyword: str = "", limit: int = 10) -> list[dict]:
        """Items filtered by geo proximity + keyword, newest first."""
        with self._lock:
            items = list(self._items)
        if keyword:
            kw = keyword.lower()
            items = [it for it in items if kw in it["title"].lower()]
        if lat is not None and lng is not None:
            def dist(it):
                g = it.get("geo")
                if not g:
                    return float("inf")
                return _haversine_km(lat, lng, g["lat"], g["lng"])
            items.sort(key=lambda it: (dist(it) == float("inf"), dist(it)))
        else:
            items.sort(key=lambda it: it.get("ts", 0), reverse=True)
        for it in items:
            it.setdefault("summary", "")
        return items[:limit]


def _parse_iso(value: str | None) -> float | None:
    """ISO-8601 timestamp -> epoch seconds (NewsAPI publishes like
    "2026-08-04T09:30:00Z"). None when unparsable."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _contains_word(needle: str, haystack: str) -> bool:
    """True when `needle` appears in `haystack` as a whole word/words.

    Word-boundary aware so "hebbal" does NOT match "Hebbalkar", while the
    multi-word "outer ring road" still matches "outer ring road traffic".
    """
    import re

    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack) is not None


def _is_junk_title(title: str) -> bool:
    """True when a DDG result is an aggregator dashboard, not a news article."""
    low = title.lower()
    return any(tok in low for tok in _JUNK_TITLE_TOKENS)


def _decode_ddg_url(href: str) -> str:
    """DDG wraps real URLs as //duckduckgo.com/l/?uddg=<urlencoded>."""
    import urllib.parse

    if "uddg=" not in href:
        return href
    try:
        for key, val in urllib.parse.parse_qsl(urllib.parse.urlparse(href).query):
            if key == "uddg":
                return val
    except ValueError:
        pass
    return href


def _unescape_html(text: str) -> str:
    """Decode HTML entities in scraped titles (&#x27; &amp; etc.)."""
    import html

    return html.unescape(text)


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    import math

    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
