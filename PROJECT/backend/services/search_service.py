"""Search orchestrator (PROMPT_4 §1-§3).

Glues Google Maps (Places New search/nearby), SerpAPI (real reviews + live
prices), reliability scoring and ride pricing into one service used by the
API. Bengaluru-specific transit wiring lives in the segment builder; this
module handles place discovery + enrichment only.

All results are REAL (Google Places + Google Reviews). Nothing is fabricated.
"""
import logging

from .clients.google_maps_client import GoogleMapsClient
from .clients.serpapi_client import SerpAPIClient
from .data_schema import Place, RidePrice
from .review_tools import ReviewTools
from .ride_pricing import fetch_live_prices, ride_prices_for_distance

logger = logging.getLogger(__name__)


class SearchService:
    def __init__(self, maps: GoogleMapsClient, serpapi: SerpAPIClient):
        self.maps = maps
        self.serpapi = serpapi
        self.reviews = ReviewTools(serpapi)

    def search_places(self, query: str, lat: float | None = None, lng: float | None = None) -> list[Place]:
        """Text search, verified + deduped + Bangalore-filtered (see client).

        When Google Places billing is off the client falls back to OSM results
        (no ratings, no Google `place_id`). We then try SerpAPI's google_maps
        search to surface the REAL Google place (rating + place_id) so the
        details flow can pull reviews. Nothing is fabricated — if SerpAPI is
        also unavailable we return the OSM hits as-is.
        """
        places = [_to_place(d) for d in self.maps.search_places(query, lat=lat, lng=lng)]
        if not places or all(p.rating is None for p in places):
            serp = self.serpapi.search_place(query, lat=lat, lng=lng)
            if serp and serp.get("place_id"):
                p = _serp_to_place(serp, query)
                if p:
                    places = [p] + [x for x in places if x.place_id != p.place_id]
        return places

    def nearby(
        self,
        lat: float,
        lng: float,
        radius_m: int = 2000,
        keyword: str = "",
        categories: list[str] | None = None,
    ) -> list[Place]:
        cat = (categories[0] if categories else "") or keyword
        places = [_to_place(d) for d in self.maps.nearby_places(lat, lng, radius_m, cat)]
        if not places or all(p.rating is None for p in places):
            serp = self.serpapi.search_place(cat, lat=lat, lng=lng)
            if serp and serp.get("place_id"):
                p = _serp_to_place(serp, cat)
                if p:
                    p.distance_km = round(
                        _haversine_km(lat, lng, p.lat, p.lng), 2)
                    places = [p] + [x for x in places if x.place_id != p.place_id]
        return places

    def enrich(self, place: Place) -> dict:
        """Enriched details for one place: real reviews + reliability + summary."""
        return self.reviews.enrich_place(place).model_dump(mode="json")

    def verify(self, name: str, lat: float, lng: float) -> Place | None:
        """Match a name+coords to a real Google place (used to pin search results)."""
        hits = [_to_place(d) for d in self.maps.search_places(name, lat=lat, lng=lng)]
        if not hits:
            return None
        # prefer the closest verified hit
        hits.sort(key=lambda p: (abs(p.lat - lat) ** 2 + abs(p.lng - lng) ** 2))
        return hits[0]

    def ride_prices(self, origin: tuple[float, float], dest: tuple[float, float],
                    group_size: int = 1) -> list[RidePrice]:
        """Live (SerpAPI) ride prices overlaid on Karnataka estimates."""
        dist_km = 0.0
        direction = self.maps.directions(origin, dest, mode="driving")
        if direction and direction.get("distance_m"):
            dist_km = direction["distance_m"] / 1000.0
        live, live_km = fetch_live_prices(self.serpapi, origin, dest)
        if not dist_km and live_km:
            dist_km = live_km
        return ride_prices_for_distance(dist_km, group_size=group_size, live_options=live)

    def suggestions(self, query: str, lat: float | None = None, lng: float | None = None) -> list[dict]:
        return [p.model_dump(mode="json") for p in self.search_places(query, lat, lng)[:5]]


def _to_place(d: dict) -> Place:
    """Client raw dict -> Place model (extra keys like phone/website dropped)."""
    return Place(**{k: v for k, v in d.items() if k in Place.model_fields})


def _serp_to_place(d: dict, query: str) -> Place | None:
    """SerpAPI google_maps search hit -> Place. None when it has no place_id/coords."""
    pid = d.get("place_id")
    lat, lng = d.get("lat"), d.get("lng")
    if not pid or lat is None or lng is None:
        return None
    return Place(
        place_id=str(pid),
        name=d.get("title") or query,
        address=d.get("address") or "",
        lat=float(lat),
        lng=float(lng),
        rating=d.get("rating"),
        user_rating_count=d.get("reviews") if isinstance(d.get("reviews"), int) else None,
        primary_type=d.get("type"),
        query=query,
    )


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    import math
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
