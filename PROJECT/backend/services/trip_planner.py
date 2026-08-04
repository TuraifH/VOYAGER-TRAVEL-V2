"""Trip Planner discovery + ranking engine (PROMPT_8 Phase 2).

Builds the candidate pool of places for a destination and scores each one with
the locked formula (spec 2.3):

    score = interest_match*0.35 + rating_normalized*0.25
          + group_type_fit*0.20 + crowd_penalty_inverse*0.10
          + uniqueness_bonus*0.10

Every recommended place carries a `why` line (no bare ranked lists) and the
pool is post-processed by the diversity rule (2.4) so a single category never
dominates. Transport logic is deliberately NOT touched here — the integration
rule (9) keeps that entirely in the segment engine.

Data source today is static seed data (`trip_seed`) which is labelled
ESTIMATED, never fabricated (golden rule #1). A live API can swap in later
behind the same `TripPlace` shape.
"""
import logging

from . import trip_seed
from .data_schema import GROUP_TYPES, GroupType, INTEREST_TAGS, RankedPlace

logger = logging.getLogger(__name__)

_EPS = 1e-9
_CROWD_VALUE = {"low": 1.0, "medium": 0.6, "high": 0.2, "unknown": 0.5}
_PACE_PER_DAY = {"relaxed": 2, "balanced": 4, "packed": 6}


class TripPlannerService:
    def destinations(self) -> list[dict]:
        return trip_seed.destinations()

    def discover_places(
        self,
        destination: str,
        interests: list[str] | None = None,
        group_type: str = "friends",
        limit: int = 12,
        budget: float | None = None,
    ) -> dict:
        """Rank the destination pool for the given interests + group type.

        Returns the top `limit` places (diversity-capped) with per-place score,
        component breakdown and a human `why` line, plus a disclaimer flag and
        an optional `relaxed` note when interests had to be widened.
        """
        interests = _normalize_interests(interests)
        pool = trip_seed.places_for_destination(destination)
        group_type = group_type if group_type in GROUP_TYPES else "friends"

        ranked = [self._rank(p, interests, group_type) for p in pool]
        ranked.sort(key=lambda rp: (-rp.score, -rp.rating, rp.review_count))

        relaxed = _should_relax(ranked, interests)
        if relaxed:
            ranked = _rank_ignoring_interest(ranked)
            ranked.sort(key=lambda rp: (-rp.score, -rp.rating, rp.review_count))

        pool_limit = max(3, limit)
        selected = _enforce_diversity(
            ranked, pool_limit, narrow=len(interests) == 1 and "food" in interests)
        _assign_ranks(selected)

        return {
            "destination": destination,
            "group_type": group_type,
            "interests": interests,
            "disclaimer": (
                "Static seed data — fees, timings, ratings and crowd are "
                "approximate. Please verify details with the venue before your trip."
            ),
            "relaxed": relaxed,
            "places": [p.model_dump(mode="json") for p in selected],
        }

    def generate_plan(
        self,
        destination: str,
        interests: list[str] | None = None,
        group_type: str = "friends",
        days: int = 3,
        pace: str = "balanced",
        budget: float | None = None,
    ) -> dict:
        """Day-wise itinerary for a destination (Phase 3 of the build).

        Ranks the pool, sizes it by pace x days, splits places into `days`
        spatially-coherent clusters (k-means on lat/lng so a day never zig-zags
        across the city) and orders each day by nearest-neighbour to avoid
        backtracking. Transport (Phase 4) + budget (Phase 5) slot in later —
        this endpoint returns place order + activity time only.
        """
        res = self.discover_places(
            destination, interests, group_type, limit=40, budget=budget)
        ranked = res["places"]
        interests = res["interests"]
        pace = pace if pace in _PACE_PER_DAY else "balanced"
        k = max(1, int(days))

        if not ranked:
            return {
                "destination": destination, "group_type": group_type,
                "interests": interests, "pace": pace, "days": [],
                "total_places": 0, "disclaimer": res["disclaimer"],
                "relaxed": res["relaxed"],
                "warning": (
                    f"No places available yet for '{destination}'. Only Bengaluru "
                    "is seeded in Phase 2."
                ),
            }

        per_day = _PACE_PER_DAY[pace]
        max_total = max(3, per_day * k)
        selected = ranked[:max_total]
        if k > len(selected):
            k = len(selected)

        clusters = _balanced_clusters(selected, k)
        days_out: list[dict] = []
        for i, cluster in enumerate(clusters, start=1):
            ordered = _order_nearest_neighbour(cluster)
            days_out.append({
                "day": i,
                "place_count": len(ordered),
                "total_activity_min": sum(p["duration_min"] for p in ordered),
                "places": ordered,
            })

        return {
            "destination": destination,
            "group_type": group_type,
            "interests": interests,
            "pace": pace,
            "days": days_out,
            "total_places": len(selected),
            "disclaimer": res["disclaimer"],
            "relaxed": res["relaxed"],
        }

    # ---------------------------------------------------------- ranking (2.3)
    @staticmethod
    def _rank(p, interests: list[str], group_type: str) -> RankedPlace:
        interest_match = _interest_match(p, interests)
        rating_norm = max(0.0, min(1.0, p.rating / 5.0))
        group_fit = _group_fit(p, group_type)
        crowd = _crowd_penalty_inverse(p)
        uniqueness = _uniqueness_bonus(p, interests)

        score = (
            0.35 * interest_match
            + 0.25 * rating_norm
            + 0.20 * group_fit
            + 0.10 * crowd
            + 0.10 * uniqueness
        )
        return RankedPlace(
            **p.model_dump(),
            score=round(score, 4),
            components={
                "interest_match": round(interest_match, 4),
                "rating_normalized": round(rating_norm, 4),
                "group_type_fit": round(group_fit, 4),
                "crowd_penalty_inverse": round(crowd, 4),
                "uniqueness_bonus": round(uniqueness, 4),
            },
            why=_why_line(p, interests, group_type, interest_match, group_fit, crowd),
        )


# --------------------------------------------------------------- sub-scores
def _interest_match(p, interests: list[str]) -> float:
    if not interests:
        return 0.5  # no interests chosen -> neutral
    matched = set(p.tags) & set(interests)
    return len(matched) / len(interests)


def _group_fit(p, group_type: str) -> float:
    if group_type in ("family_kids", "family"):
        if p.category == "nightlife":
            return 0.0 if not p.family_friendly else 0.5
        if not p.family_friendly:
            return 0.0
        return 1.0
    if group_type == "senior":
        if p.physically_demanding:
            return 0.0
        if p.category == "nightlife":
            return 0.5
        if not p.family_friendly:
            return 0.5
        return 1.0
    # solo / couple / friends ride freely
    return 1.0


def _crowd_penalty_inverse(p) -> float:
    if not p.crowd:
        return 0.5  # Unknown -> neutral, never confident (2.1)
    slots = p.best_times if p.best_times else list(p.crowd.keys())
    values = [_CROWD_VALUE.get(p.crowd.get(s, "unknown"), 0.5) for s in slots]
    return sum(values) / len(values)


def _uniqueness_bonus(p, interests: list[str]) -> float:
    is_offbeat = "offbeat" in p.tags
    if is_offbeat and "offbeat" in interests:
        return 1.0
    if is_offbeat:
        return 0.5
    return 0.2


def _why_line(p, interests, group_type, interest_match, group_fit, crowd) -> str:
    parts: list[str] = []
    matched = sorted(set(p.tags) & set(interests))
    if matched:
        parts.append("matches your " + _pretty_list(matched))
    if p.rating >= 4.3:
        parts.append(f"highly rated ({p.rating:.1f})")
    if p.category == "nightlife" and group_type in ("solo", "couple", "friends"):
        parts.append("nightlife pick")
    if "offbeat" in p.tags:
        parts.append("an offbeat gem")
    if group_fit == 1.0 and group_type in ("family_kids", "family"):
        parts.append("family-friendly")
    if crowd >= 0.8:
        parts.append("quiet/low-crowd windows")
    if not parts:
        parts.append("good fit for your trip")
    return "; ".join(parts)


def _pretty_list(items: list[str]) -> str:
    items = [i.replace("_", " ") for i in items]
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


# ----------------------------------------------------------- helpers
def _normalize_interests(interests: list[str] | None) -> list[str]:
    if not interests:
        return []
    seen: list[str] = []
    for i in interests:
        i = i.strip().lower().replace(" ", "_").replace("-", "_")
        if i and i not in seen and i in INTEREST_TAGS:
            seen.append(i)
    return seen


def _should_relax(ranked: list[RankedPlace], interests: list[str]) -> bool:
    """Few matching places -> auto-widen instead of returning a thin pool (8.1)."""
    if not interests:
        return False
    matching = sum(1 for rp in ranked if set(rp.tags) & set(interests))
    return matching < 4


def _rank_ignoring_interest(ranked: list[RankedPlace]) -> list[RankedPlace]:
    """Rerank by rating/group-fit only when interest filter was too narrow."""
    for rp in ranked:
        rp.components["interest_match"] = 0.0
        rp.score = round(
            0.25 * rp.components["rating_normalized"]
            + 0.20 * rp.components["group_type_fit"]
            + 0.10 * rp.components["crowd_penalty_inverse"]
            + 0.10 * rp.components["uniqueness_bonus"]
            + 0.35 * 0.5,  # neutral interest term
            4,
        )
        rp.why = "Interest filter was thin — widened to nearby options. " + rp.why
    return ranked


def _enforce_diversity(ranked: list[RankedPlace], limit: int, narrow: bool) -> list[RankedPlace]:
    """Cap any single category at ~40% of the returned pool (2.4).

    `narrow` (basically "only Food" selected) relaxes the cap to avoid flattening
    an intentionally single-focused trip, only guarding against pure repetition.
    """
    out: list[RankedPlace] = []
    counts: dict[str, int] = {}
    for rp in ranked:
        if len(out) >= limit:
            break
        cap = limit if narrow else max(1, round(0.4 * limit))
        if counts.get(rp.category, 0) >= cap and len(out) + 1 > cap:
            # category saturated; try another category instead of duplicating
            if any(c for c in _cat_of_all(ranked)
                   if counts.get(c, 0) < cap):
                continue
        out.append(rp)
        counts[rp.category] = counts.get(rp.category, 0) + 1
    return out


def _cat_of_all(ranked: list[RankedPlace]) -> list[str]:
    return [rp.category for rp in ranked]


def _assign_ranks(selected: list[RankedPlace]) -> None:
    for i, rp in enumerate(sorted(selected, key=lambda r: -r.score), start=1):
        rp.rank = i


# ------------------------------------------------------- Phase 3: day clustering
def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    import math
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _hd(a: tuple, b: tuple) -> float:
    return _haversine_km(a[0], a[1], b[0], b[1])


def _kmeans(points: list[dict], k: int, iters: int = 12) -> list[list[dict]]:
    """k-means on (lat, lng) to build spatially-coherent day clusters (3.1).

    Prefer `_balanced_clusters` for the public plan (this one can over-fill a
    day when city-centre places dominate and a couple of far outliers exist).
    """
    coords = [(p["lat"], p["lng"]) for p in points]
    if k >= len(coords):
        return [[p] for p in points]

    # farthest-point seeding (k-means++) for stable, spread-out clusters.
    seeds = [coords[0]]
    while len(seeds) < k:
        seeds.append(max(coords, key=lambda c: min(_hd(c, s) for s in seeds)))

    cents = [list(s) for s in seeds]
    for _ in range(iters):
        groups: list[list[tuple]] = [[] for _ in range(k)]
        for c in coords:
            groups[min(range(k), key=lambda j: _hd(c, cents[j]))].append(c)
        next_cents = []
        for g in groups:
            if not g:
                next_cents.append(list(cents[len(next_cents)]))
            else:
                next_cents.append([sum(p[0] for p in g) / len(g),
                                   sum(p[1] for p in g) / len(g)])
        cents = next_cents

    clusters: list[list[dict]] = [[] for _ in range(k)]
    for p in points:
        c = (p["lat"], p["lng"])
        clusters[min(range(k), key=lambda j: _hd(c, cents[j]))].append(p)
    clusters = [c for c in clusters if c]
    clusters.sort(key=len, reverse=True)  # fullest days first
    return clusters


def _greedy_chain(points: list[dict]) -> list[dict]:
    """Order points by nearest-neighbour from the centroid (start of a route)."""
    pts = list(points)
    clat = sum(p["lat"] for p in pts) / len(pts)
    clng = sum(p["lng"] for p in pts) / len(pts)
    start = min(pts, key=lambda p: _hd((clat, clng), (p["lat"], p["lng"])))
    pts.remove(start)
    chain = [start]
    while pts:
        last = chain[-1]
        nxt = min(pts, key=lambda p: _hd(
            (last["lat"], last["lng"]), (p["lat"], p["lng"])))
        pts.remove(nxt)
        chain.append(nxt)
    return chain


def _balanced_clusters(points: list[dict], k: int) -> list[list[dict]]:
    """Spatially-coherent + size-balanced day clusters (3.1).

    Builds one greedy nearest-neighbour chain across all places (so consecutive
    places are near each other), then slices the chain into `k` contiguous,
    near-equal chunks. Nearby places land in the same day and no day is
    overloaded — avoids the city-centre-vs-outlier imbalance of raw k-means.
    """
    chain = _greedy_chain(points)
    n = len(chain)
    if k >= n:
        return [[p] for p in chain]
    size = n // k
    rem = n % k
    clusters: list[list[dict]] = []
    idx = 0
    for j in range(k):
        sz = size + (1 if j < rem else 0)
        clusters.append(chain[idx:idx + sz])
        idx += sz
    return clusters


def _order_nearest_neighbour(points: list[dict]) -> list[dict]:
    """Greedy nearest-neighbour TSP within a day to avoid backtracking (3.2)."""
    if len(points) <= 1:
        return list(points)
    pts = list(points)  # already score-descending; start from the best
    start = pts.pop(0)
    path = [start]
    while pts:
        last = path[-1]
        nxt = min(pts, key=lambda p: _hd(
            (last["lat"], last["lng"]), (p["lat"], p["lng"])))
        pts.remove(nxt)
        path.append(nxt)
    return path