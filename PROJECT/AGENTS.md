# VOYAGER v2 — Session Cheat-Sheet

> Short auto-loaded guide. **FULL reference: `MASTER_KNOWLEDGE_BASE.md` (source of truth).**
> The old parent repo is RETIRED — never read/reference/fix it. Build here only.

## Repo rule (one repo, one branch, pull-only)
- Latest GitHub `main` is ALWAYS the master. `git pull` before work, push only after green.
- Large files (PBF, pickle) are **Git LFS** — after clone run `git lfs install` + `git lfs pull`
  (GitHub downloads them on `git pull` once LFS is installed).
- Never `git fetch --filter=blob:none` (breaks on flaky nets).
- Never keep divergent local commits (it corrupted a collaborator's machine — see MASTER §19.3).

## Running (from this `PROJECT/` folder)
```powershell
docker compose up -d graphhopper        # :8080 — the ONLY container needed (Bangalore PBF committed)
python -m uvicorn backend.main:app --reload --port 8000
cd frontend; npx vite --port 3000       # axios → http://localhost:8000/api (CORS enabled)
```
QA: `python -m pytest tests/ -q` (104 pass) · `cd frontend; npx tsc --noEmit` (0 errors)

## Architecture
- Backend: FastAPI `backend/main.py` (CORS: localhost:3000 + *.onrender.com) → `api/routes.py`
  → services: `app_state.py` (lazy singletons), `gtfs_service.py`, `fare_engine.py`, `database.py`,
  `transit_graph.py`, `route_finder.py`, `segment_builder.py` (hop centerpiece),
  `search_service.py`, `topsis_engine.py`, `ride_pricing.py`, `review_tools.py`, `news_engine.py`,
  `train_service.py`, `traffic_model.py`, `clients/` (google_maps, serpapi, weather), `langgraph/`.
- Frontend: `src/context/AppContext.tsx` (state), `services/api.ts` (axios), `pages/MainPage.tsx`,
  components: HeaderBar, MapView, SearchPanel, AToBPanel, SegmentFlowView, DiscoveryPanel,
  TripPanel, NewsPopup.

## Data sources (ALL REAL — never fabricate)
- Transit: BMTC GTFS (pickle `DATA_FOLDER/processed/gtfs_cache.pkl`), metro Purple+Green only
  (NO Yelahanka/Blue), Karnataka rail. Fares from `transit_fares.json` + Karnataka govt ride rates.
- Places: **Google Places (New) first → OpenStreetMap Nominatim fallback** (Google 403/billing off).
- Reviews: SerpAPI real (`place_results.user_reviews.most_relevant`, keys `username`/`description`).
- Weather: Open-Meteo. News: Reddit+DDG via DataImpulse. Trains: eRail.in. LLM: summaries ONLY
  (never numbers).

## Golden rules
1. No fake data ever. Missing → "Unavailable/Estimated" labeled. LLM never writes numbers.
2. Backend does all thinking; frontend is a dumb renderer.
3. Every fallback is labeled (interpolated = dashed, rides = Live vs Estimated).
4. OSRM is retired — GraphHopper :8080 only.

## PROMPT status
1–7 DONE (104 tests). 8 = Trip Planner (design locked). 9 = Deploy Render+Neon (CORS pre-wired).
Next: enable Google billing (for real ratings/photos) → PROMPT_8.

## Known-current
- Search returns real OSM places (no ratings/photos until Google billing re-enabled). CORS fixed.
- HeaderBar + AToB have current-location buttons. Search suggestions appear after 2+ chars (300ms).
- Every commit touches only `PROJECT/` + this doc.
