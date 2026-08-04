"""HTTP endpoints for the interactive segment planner (PROMPT_3), the
place search / scoring / pricing layer (PROMPT_4), and the live LangGraph
layer (PROMPT_5).

  POST /api/routes/segments        -> Segment 1 FULL + Segment 2 FULL + probes
  POST /api/routes/segment-next    -> next segment time-chained from chosen leg
  GET  /api/search/places          -> Google Places text search
  GET  /api/search/nearby          -> category nearby search
  POST /api/search/enrich          -> real reviews + reliability + summary
  POST /api/search/verify          -> pin a name+coords to a real place
  POST /api/rides/prices           -> live/estimated ride prices for a pair
  POST /api/langgraph/ask          -> full agent loop (chat/synthesis)
  POST /api/langgraph/route-context-> LiveContext for a route
  GET  /api/search/news            -> cached corridor news
  GET  /api/search/weather         -> Open-Meteo current + rain window
  GET  /api/routes/live-trains     -> eRail.in live trains (or flagged fallback)
"""
from pydantic import BaseModel, Field

from fastapi import APIRouter, Response

from backend.services import app_state
from backend.services.data_schema import Place
from backend.services.segment_builder import _parse_current_time


router = APIRouter()
search_router = APIRouter()  # /api/search/* + /api/rides/* (no /routes prefix)


class PlaceModel(BaseModel):
    lat: float
    lng: float
    name: str = ""


class SegmentsRequest(BaseModel):
    source: PlaceModel
    destination: PlaceModel
    group_size: int = Field(default=1, ge=1)
    budget: float = Field(default=500.0, ge=0)
    current_time: str | None = None


class ChosenLeg(BaseModel):
    optionId: str = ""
    arrivalTime: str | None = None
    # the backend emits destinationStop as {name,lat,lng}; accept both shapes
    destinationStop: dict | str = {}


class SegmentNextRequest(BaseModel):
    journey: dict
    chosen_legs: list[ChosenLeg]
    group_size: int = Field(default=1, ge=1)
    budget: float = Field(default=500.0, ge=0)


class NearbyRequest(BaseModel):
    lat: float
    lng: float
    radius_m: int = Field(default=2000, ge=100, le=20000)
    keyword: str = ""
    categories: list[str] = Field(default_factory=list)


class EnrichRequest(BaseModel):
    place: dict


class VerifyRequest(BaseModel):
    name: str
    lat: float
    lng: float


class RidesRequest(BaseModel):
    origin: PlaceModel
    destination: PlaceModel
    group_size: int = Field(default=1, ge=1)


class DriveRequest(BaseModel):
    origin: PlaceModel
    destination: PlaceModel


class TripDiscoverRequest(BaseModel):
    destination: str = "bengaluru"
    interests: list[str] = Field(default_factory=list)
    group_type: str = "friends"
    limit: int = Field(default=12, ge=3, le=40)
    budget: float | None = None


class TripPlanRequest(BaseModel):
    destination: str = "bengaluru"
    interests: list[str] = Field(default_factory=list)
    group_type: str = "friends"
    days: int = Field(default=3, ge=1, le=30)
    pace: str = "balanced"
    budget: float | None = None


@search_router.post("/routes/drive")
def drive_route(req: DriveRequest):
    """GraphHopper car route -> {geometry, distance_m, duration_s, path_source}.

    Used by the A->B panel so a drive/ride path renders on the map (the browser
    never talks to GraphHopper directly). Falls back to a straight line flagged
    `interpolated` when the container is down.
    """
    gh = app_state.get_gh()
    result = gh.route("car", req.origin.lat, req.origin.lng,
                      req.destination.lat, req.destination.lng)
    if not result:
        return {"geometry": [[req.origin.lat, req.origin.lng],
                             [req.destination.lat, req.destination.lng]],
                "distance_m": 0.0, "duration_s": 0.0, "path_source": "interpolated",
                "mode": "car"}
    return result.model_dump(mode="json")


@router.post("/segments")
def segments(req: SegmentsRequest):
    builder = app_state.get_builder()
    return builder.build_segments(
        source=req.source.model_dump(),
        destination=req.destination.model_dump(),
        group_size=req.group_size,
        budget=req.budget,
        current_time=req.current_time,
    )


@router.post("/segment-next")
def segment_next(req: SegmentNextRequest):
    builder = app_state.get_builder()
    return builder.build_segment_next(
        journey=req.journey,
        chosen_legs=[c.model_dump() for c in req.chosen_legs],
        group_size=req.group_size,
        budget=req.budget,
    )


def _quick_plan_json(p):
    """Serialize a RoutePlan dataclass into a JSON-safe dict (legs -> lists)."""
    return {
        "legs": [
            {
                "mode": l.mode,
                "route_number": l.route_number,
                "from_stop": l.from_stop,
                "to_stop": l.to_stop,
                "from_lat": l.from_lat,
                "from_lng": l.from_lng,
                "to_lat": l.to_lat,
                "to_lng": l.to_lng,
                "line": l.line,
                "depart_time": l.depart_time,
                "arrive_time": l.arrive_time,
                "duration_min": l.duration_min,
                "distance_m": l.distance_m,
                "fare": l.fare,
                "per_person_fare": l.per_person_fare,
                "geometry": [list(pt) for pt in l.geometry],
                "geometry_source": l.geometry_source,
                "status": l.status,
                "alternate_routes": list(l.alternate_routes),
            }
            for l in p.legs
        ],
        "total_fare": p.total_fare,
        "total_duration_min": p.total_duration_min,
        "total_walk_km": p.total_walk_km,
        "transfers": p.transfers,
        "per_person_fare": p.per_person_fare,
        "summary": p.summary,
    }


@router.post("/quick-suggestion")
def quick_suggestion(req: SegmentsRequest):
    """One-shot auto-computed best route (A* pathfinder), separate from the
    interactive hop-by-hop tree. Returns the top ranked plans as flat leg lists.
    """
    finder = app_state.get_finder()
    now_min, _iso = _parse_current_time(req.current_time)
    budget_pp = max(1.0, req.budget / max(1, req.group_size))
    plans = finder.find_routes_by_coords(
        req.source.lat, req.source.lng,
        req.destination.lat, req.destination.lng,
        depart_min=now_min,
        group_size=req.group_size,
        budget_pp=budget_pp,
    )
    return {"plans": [_quick_plan_json(p) for p in plans]}


# ============================================================ PROMPT_4 search
@search_router.get("/search/places")
def search_places(q: str, lat: float | None = None, lng: float | None = None):
    svc = app_state.get_search()
    places = svc.search_places(q, lat=lat, lng=lng)
    return {"query": q, "places": [p.model_dump(mode="json") for p in places]}


@search_router.get("/search/nearby")
def search_nearby(lat: float, lng: float, radius_m: int = 2000,
                  keyword: str = "", categories: str = ""):
    svc = app_state.get_search()
    cats = [c.strip() for c in categories.split(",") if c.strip()]
    places = svc.nearby(lat, lng, radius_m=radius_m, keyword=keyword, categories=cats)
    return {"places": [p.model_dump(mode="json") for p in places]}


@search_router.post("/search/enrich")
def search_enrich(req: EnrichRequest):
    svc = app_state.get_search()
    try:
        place = Place(**req.place)
    except Exception:  # noqa: BLE001 — client sent a malformed place
        return {"error": "invalid place payload"}
    return svc.enrich(place)


@search_router.post("/search/verify")
def search_verify(req: VerifyRequest):
    svc = app_state.get_search()
    place = svc.verify(req.name, req.lat, req.lng)
    return {"verified": place.model_dump(mode="json") if place else None}


@search_router.post("/rides/prices")
def rides_prices(req: RidesRequest):
    svc = app_state.get_search()
    prices = svc.ride_prices(
        (req.origin.lat, req.origin.lng),
        (req.destination.lat, req.destination.lng),
        group_size=req.group_size,
    )
    return {"prices": [p.model_dump(mode="json") for p in prices]}


# ============================================================ PROMPT_5 live
class RouteContextRequest(BaseModel):
    source: PlaceModel
    destination: PlaceModel
    group_size: int = Field(default=1, ge=1)
    budget: float = Field(default=500.0, ge=0)
    current_time: str | None = None
    place: dict | None = None


class AskRequest(BaseModel):
    message: str
    lat: float | None = None
    lng: float | None = None
    context: dict | None = None


class TrainRequest(BaseModel):
    from_station: str
    to_station: str


@search_router.post("/langgraph/route-context")
def langgraph_route_context(req: RouteContextRequest):
    agent = app_state.get_agent()
    return agent.gather_route_context(
        src=req.source.model_dump(),
        dst=req.destination.model_dump(),
        group_size=req.group_size,
        budget=req.budget,
        current_time=req.current_time,
        place=req.place,
    )


@search_router.post("/langgraph/ask")
def langgraph_ask(req: AskRequest):
    agent = app_state.get_agent()
    return agent.ask(req.message, lat=req.lat, lng=req.lng, context=req.context)


@search_router.get("/search/news")
def search_news(lat: float | None = None, lng: float | None = None,
                keyword: str = "", limit: int = 10):
    engine = app_state.get_news()
    return {"items": engine.relevant(lat=lat, lng=lng, keyword=keyword, limit=limit)}


@search_router.get("/search/weather")
def search_weather(lat: float, lng: float):
    client = app_state.get_weather()
    return client.current(lat, lng) or {"condition": "unavailable"}


@search_router.get("/search/photo")
def search_photo(name: str, max_width: int = 400):
    """Proxy a real Google Places photo (keeps the API key server-side).

    Fetches the image bytes backend-side and streams them to the browser, so the
    key never appears in the client's network traffic.
    """
    svc = app_state.get_search()
    photo_name = name if name.startswith("places/") else f"places/{name}"
    img = svc.maps.fetch_photo(photo_name, max_width=max_width)
    if not img:
        return Response(status_code=404)
    content, content_type = img
    return Response(content=content, media_type=content_type)


@search_router.get("/photo")
def photo_alias(name: str, max_width: int = 400):
    """Alias the DiscoveryPanel already calls (/api/photo)."""
    return search_photo(name, max_width=max_width)


@search_router.get("/routes/live-trains")
def live_trains(from_station: str, to_station: str):
    svc = app_state.get_trains()
    fc, tc = svc.code_for(from_station), svc.code_for(to_station)
    if not fc or not tc:
        return {"trains": [], "source": "none", "note": "no station codes mapped"}
    return svc.trains_between(fc, tc)


@search_router.get("/routes/traffic-model-info")
def traffic_model_info():
    """Transparency endpoint (PROMPT_7 §2.3): what the traffic model is + its MAE."""
    model = app_state.get_traffic()
    info = model.model_info()
    info["range"] = [1.0, 1.8]
    return info


# ====================================================== PROMPT_8 Trip Planner
@search_router.get("/trip/destinations")
def trip_destinations():
    """Seeded destination catalogue for the Trip Planner Step-1 picker."""
    return {"destinations": app_state.get_trip().destinations()}


@search_router.post("/trip/places")
def trip_discover(req: TripDiscoverRequest):
    """Ranked, diversity-capped place pool for a destination + interests (2)."""
    return app_state.get_trip().discover_places(
        destination=req.destination,
        interests=req.interests,
        group_type=req.group_type,
        limit=req.limit,
        budget=req.budget,
    )


@search_router.post("/trip/plan")
def trip_plan(req: TripPlanRequest):
    """Day-wise itinerary: rank -> cluster by day -> order within day (3)."""
    return app_state.get_trip().generate_plan(
        destination=req.destination,
        interests=req.interests,
        group_type=req.group_type,
        days=req.days,
        pace=req.pace,
        budget=req.budget,
    )
