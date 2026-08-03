"""Place review pipeline (PROMPT_4 §2.3).

Chain: search_places -> place_id -> SerpAPI place_details (real Google Reviews)
       -> top-2-per-star sample -> reliability score -> LLM summary.

Golden rule: reviews are REAL (SerpAPI). The LLM only *summarizes* what the
reviews actually say — it never writes reviews, ratings, or scores. On any
failure the result degrades to what is known (possibly empty reviews), never
to fabricated data.
"""
import logging
from typing import Any

from .clients.serpapi_client import SerpAPIClient
from .data_schema import Place, PlaceDetails, ReliabilityInput, Review
from .reliability import compute_reliability
from .sentiment import sentiment_avg

logger = logging.getLogger(__name__)

_REVIEW_CACHE_VERSION = 2  # bump to invalidate stale cache entries


class ReviewTools:
    def __init__(self, serpapi: SerpAPIClient):
        self._serpapi = serpapi
        self._cache: dict[str, PlaceDetails] = {}

    def enrich_place(self, place: Place, max_reviews: int = 24) -> PlaceDetails:
        """Turn a search Place into enriched PlaceDetails (reviews + reliability)."""
        place, meta = self._resolve(place)
        if not place.place_id:
            return self._degrade(place, "no place_id")
        cached = self._cache.get(place.place_id)
        if cached:
            return cached
        detail = self._serpapi.place_details(place.place_id)
        if not detail:
            # still return the resolved Google metadata (rating etc.) — not a bare degrade
            out = self._build_details(place, meta, [], None, None)
            self._cache[place.place_id] = out
            return out

        reviews = [Review(**{k: r.get(k, v) for k, v in Review().model_dump().items() if k in r})
                   for r in detail.get("reviews", [])][:max_reviews]
        if not reviews and detail.get("user_rating_count"):
            # real count exists but Google returned no review bodies -> honest empty list
            logger.info("[reviews] %s: count=%s but no review bodies from SerpAPI",
                        place.name, detail.get("user_rating_count"))

        sentiment = sentiment_avg([r.text for r in reviews]) if reviews else 0.5
        rel = compute_reliability(ReliabilityInput(
            rating=detail.get("rating") or meta.get("rating") or place.rating or 0.0,
            review_count=detail.get("user_rating_count") or place.user_rating_count or len(reviews),
            sentiment_avg=sentiment,
            business_status=detail.get("business_status") or place.business_status,
        ))

        summary, concerns = self._summarize(reviews, rel.score_pct)

        out = self._build_details(
            place, meta, reviews, sentiment, rel,
            phone=detail.get("phone"), website=detail.get("website"),
            rating=detail.get("rating"), count=detail.get("user_rating_count"),
            status=detail.get("business_status"),
            open_now=detail.get("open_now"), hours=detail.get("weekday_hours") or [],
            summary=summary, concerns=concerns,
        )
        self._cache[place.place_id] = out
        return out

    def _resolve(self, place: Place) -> tuple[Place, dict]:
        """Resolve an OSM/unknown place to a real Google place via SerpAPI.

        Returns (place, meta) where `meta` carries any Google-side metadata
        (rating/count/status/hours/photo) learned during resolution. Real data
        only — no resolution means `meta` is empty.
        """
        if place.place_id and not place.place_id.startswith("osm:"):
            return place, {}
        hit = self._serpapi.search_place(place.name, lat=place.lat or None, lng=place.lng or None)
        if not hit or not hit.get("place_id"):
            return place, {}
        meta = dict(hit)
        resolved = Place(
            **{**place.model_dump(), "place_id": str(hit["place_id"]),
               "rating": place.rating or hit.get("rating"),
               "user_rating_count": place.user_rating_count
               if place.user_rating_count else (hit.get("reviews") if isinstance(hit.get("reviews"), int) else None),
               "business_status": place.business_status or hit.get("business_status")})
        return resolved, meta

    def _build_details(self, place: Place, meta: dict, reviews: list[Review],
                       sentiment, rel, **extra) -> PlaceDetails:
        base = PlaceDetails(
            **place.model_dump(exclude={"place_id"}),
            place_id=place.place_id,
            reviews=reviews,
            sentiment_avg=round(sentiment, 3) if sentiment is not None else None,
            reliability_score=rel.score_pct if rel else None,
            pin_class=rel.pin_class if rel else "yellow",
            summary=extra.get("summary", "") or "",
            concerns=extra.get("concerns", []) or [],
        )
        for key, src in (
            ("rating", meta.get("rating") if meta else None),
            ("user_rating_count", meta.get("reviews") if meta and isinstance(meta.get("reviews"), int) else None),
            ("business_status", meta.get("business_status") if meta else None),
            ("address", meta.get("address") if meta else None),
        ):
            if extra.get(key) is None and src is not None and getattr(base, key, None) is None:
                setattr(base, key, src)
        if extra.get("phone") is not None:
            base.phone = extra["phone"]
        if extra.get("website") is not None:
            base.website = extra["website"]
        if extra.get("rating") is not None:
            base.rating = extra["rating"]
        if extra.get("count") is not None:
            base.user_rating_count = extra["count"]
        if extra.get("status") is not None:
            base.business_status = extra["status"]
        if extra.get("open_now") is not None:
            base.open_now = extra["open_now"]
        if extra.get("hours"):
            base.weekday_hours = extra["hours"]
        return base

    def _summarize(self, reviews: list[Review], score_pct: int) -> tuple[str, list[str]]:
        """LLM summary of REAL reviews; empty strings when unavailable.

        The summary text may mention review themes; numbers come only from the
        actual review objects. If no LLM key, return a deterministic headline.
        """
        texts = [r.text for r in reviews if r.text.strip()]
        if not texts:
            return "", []
        try:
            from ..agents import review_summarizer

            result = review_summarizer.summarize(texts, score_pct)
            if result:
                return result.summary, result.concerns
        except Exception as exc:  # noqa: BLE001 — optional
            logger.warning("[reviews] LLM summary unavailable: %s", exc)
        return f"Based on {len(reviews)} Google reviews (reliability {score_pct}%).", []

    @staticmethod
    def _degrade(place: Place, reason: str) -> PlaceDetails:
        logger.info("[reviews] %s: %s — returning base place", place.name, reason)
        return PlaceDetails(**place.model_dump(), reliability_score=None, pin_class="yellow")
