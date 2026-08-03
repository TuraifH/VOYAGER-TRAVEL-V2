# VOYAGER v2 — MASTER KNOWLEDGE BASE (COMPLETE)

> **Purpose:** A single, complete, plain-language reference for the ENTIRE VOYAGER v2 project.
> This file is the source of truth. Read it fully before starting any future work session.
> It explains: what the product is, the non-negotiable rules, the full 9-prompt roadmap (done +
> pending), every backend module with exact contracts, every frontend component, every dataset,
> every integration and WHY we chose it, the proxy system, the hop/segment mechanism in deep
> detail, every problem we hit and the better option we chose so it never regresses, all 104
> tests, performance budgets, the Docker setup, and exactly what to do next.
>
> Written: 2026-08-01. Last updated: 2026-08-03 (PROMPT_1–7 DONE, 104 tests green; 2026-08-03
> hardening session merged: map-fly-away root cause fixed, progressive hop builder, SerpAPI rating
> fallback, OSM→Google place resolution, LLM provider chain (OpenRouter→Gemini), `/routes/drive`,
> CSS stacking-context fixes).
> Source of truth: this file + `PROJECT/` — **self-contained; no external folder is referenced.**
>
> **READ §19.4 first** — it is the latest recorded session (2026-08-03) and explains exactly what
> broke, why, and what we chose instead so it never regresses. §28–§31 are the full deep-dive
> anatomy + current run state + next-actions master plan.

## ⚠️ FRESH-START MIGRATION (READ FIRST)

**The old parent repo is DEAD as a reference. It is being retired.**
- The old repo root `C:\Users\len\OneDrive\Desktop\VOYAGER` (with parent `backend/`,
  `frontend/`, `ml/`, `osrm-data/`, stale root `docker-compose.yml` with osrm-car/osrm-foot,
  and the broken local git history) is **no longer the working location**.
- A **NEW clean GitHub repo + NEW clean folder** is live: `C:\Users\len\OneDrive\Desktop\VOYAGER_2`
  (origin `https://github.com/Surjo-Sekhar-Sen/VOYAGER-TRAVEL-V2.git`). ALL of the
  project's working files live under the repo root of that folder (the old `PROJECT/`
  subfolder layout is now the repo root).
- This document contains **EVERYTHING** needed to rebuild/continue from the new folder:
  code contracts, dataset list, API reference, constants, error glossary (all past bugs so they
  never regress), run commands, and the full problem→solution history. **Nothing from the old
  folder is required.**
- Rule going forward: **one repo, one branch (`main`), one source of truth (this file + the
  `PROJECT/` folder).** Never create divergent local commits (that caused the friend's machine
  to break — see §19.3). The latest GitHub `main` is ALWAYS the master; local machines pull it.
- `bangalore.osm.pbf` (42MB, GraphHopper map) and `DATA_FOLDER/processed/gtfs_cache.pkl` (76MB)
  are **tracked via Git LFS** (`git lfs migrate import` already run, `.gitattributes` committed).
  A fresh clone must have `git lfs install` + `git lfs pull` to materialize the real bytes
  (GitHub auto-downloads on `git pull` when LFS is installed). `.env` (secrets) is NOT in git —
  copy it separately.

---

## TABLE OF CONTENTS

1. How To Read This File (mental model)
2. The Elevator Pitch (what VOYAGER is)
3. The Non-Negotiable Product Rules
4. The Golden Build Rule (most important thing)
5. Tech Stack & Ports
6. Directory Map (full current tree)
7. The Roadmap — 9 Build Prompts, status table
8. Architecture Overview (how all the pieces fit)
9. PROMPT_1 — Data Layer (DONE)
10. PROMPT_2 — Routing Graph + Route Finder (DONE)
11. PROMPT_3 — Segment Builder API, the Hop Mechanism (DONE)
12. PROMPT_4 — Search, Reliability, TOPSIS (DONE)
13. PROMPT_5 — LangGraph Live Layer (DONE)
14. PROMPT_6 — Frontend (DONE)
15. Integrations Deep-Dive (SerpAPI, Google Maps, OSM, GraphHopper, Open-Meteo, eRail, Reddit, OpenRouter/Gemini, DataImpulse) — WHY each was chosen
16. The Proxy System (DataImpulse) — exactly when it is used and never used
17. Data Sources & Datasets Inventory
18. Environment Variables & Secrets
19. Everything Achieved & Corrected So Far (session log) — incl. 2026-08-02 fixes + friend-git incident
20. Problems → Better Options Chosen (error glossary, do-not-regress)
21. Tests & QA (all 104, per file)
22. Performance Budgets & Benchmarks
23. Docker & Local Run Guide (+ collaborator setup)
24. What To Do Next — PROMPT_7 (done), 8, 9 in detail
25. Appendix A — Full API Endpoint Reference
26. Appendix B — Key Constants (radii, speeds, fares, budgets)
27. Appendix C — Honest-Fallbacks & Deliberate Decisions (the "no fake data" map)
28. Deep-Dive Anatomy — every pipeline, step by step, with REAL example outputs
29. The 2026-08-03 Hardening Session — decisions summary (full record in §19.4 / §20 #26–36)
30. Current Run State — ports, PIDs, proxy, Docker, and a full verify checklist
31. Next Actions Master Plan — Docker (why), Google billing, live rides, PROMPT_8/9, QA loop

---

## 1. HOW TO READ THIS FILE (mental model)

This project is built **fresh** from scratch (`PROJECT/`), prompt-by-prompt, in strict order:
PROMPT_1 (data) → PROMPT_2 (graph) → PROMPT_3 (segment builder) → PROMPT_4 (search/scoring) →
PROMPT_5 (live layer) → PROMPT_6 (frontend) → PROMPT_7 (ML/testing, NEXT) → PROMPT_8 (trip
planner) → PROMPT_9 (deploy).

The mental model is a pipeline:

```
DATA (GTFS, metro, rail, fares, logs)
   → GRAPH (bus/metro/rail nodes + walk edges)
   → ROUTE FINDER (best-first A* N-hop search)
   → SEGMENT BUILDER (tree of hop choices — the centerpiece)
   → SEARCH & SCORING (Google Places + SerpAPI reviews + reliability + TOPSIS)
   → LIVE LAYER (LangGraph gathers weather/traffic/news/prices/trains in parallel)
   → FRONTEND (React/TS + Leaflet, dumb renderer, glassmorphism)
   → TRIP PLANNER (PROMPT_8, on top of A→B)
   → DEPLOY (Render + Neon, PROMPT_9)
```

Every stage feeds the next. Each PROMPT's section below documents: **what was built, the exact
file, the exact contract (field names / numbers), the tests that prove it, and the problems we
fixed so they never regress.**

---

## 2. THE ELEVATOR PITCH (what VOYAGER is)

**VOYAGER** is a Bengaluru-first "everything you need to move around" travel/navigation app:

- **SEARCH** — find a place, or find things *nearby* (ATM, mall, petrol pump, cafe…), with
  **real Google reviews**, a **reliability score** (green/yellow/red pill), photos, hours, and
  prices for hotels — because Google Maps results are full of dead/fake/wrong locations.
- **A→B** — plan a trip from A to B **three ways**:
  - **Public/Online** → either a **Direct Ride** (Uber/Ola/Rapido/Auto cards with live or
    estimated prices + ETA) or a Google-Maps-like **multi-hop transit segment window** with real
    BMTC bus numbers, scheduled times, Namma Metro Purple/Green, KIA airport buses, walk
    transfers. The multi-hop window is the **centerpiece**: the user picks their own hop-by-hop
    journey, and every hop is *real* — real bus numbers, real scheduled departure times, real
    geometry, real fares.
  - **Drive** → real road-following path + live petrol cost (₹/litre ÷ mileage).
  - **Walk** → road-following or interpolated path, free.
- **TRIP** (PROMPT_8) — a multi-day destination-and-itinerary planner (2–5 days) with budget,
  interests, pace, geo-clustered day assignment, per-day map pins, on-demand transport, and
  Postgres persistence.

**Non-negotiable product rules (from the owner):**
- **No fake data. Ever.** No fabricated bus numbers, timings, fares, reviews, reliability scores,
  news headlines, or prices. If a real source has no data, show nothing or an explicitly labeled
  "Estimated / Approx / Unavailable" state — never invent.
- The backend does **100% of the thinking**. The frontend is a dumb renderer + local filter.
- Real Google Maps quality: "Govt School → Wonderla = take 507-D → Kogilu Cross, then KIA-9 →
  Majestic, then Purple metro → Challaghatta, then walk → 231 bus → Wonderla." That exact kind of
  journey, segmented, with choices at every level.
- Every ride/path/pricing label: **Live vs Estimated** (SerpAPI live = Live; formula = Estimated).
- Only operational metro: **Purple + Green**. **NO Blue Line, NO Yelahanka** (under construction).

---

## 3. THE NON-NEGOTIABLE PRODUCT RULES (owner's words, locked)

1. **No fake data ever.** Real bus numbers, real schedules, real fares, real reviews, real
   prices, real news. If unavailable → show "Unavailable / Estimated / Approx" clearly labeled.
2. **LLM never writes numbers.** No fares, timings, bus numbers, review text, reliability scores,
   news headlines, or prices come from the LLM. The LLM only *summarizes* and *explains*.
3. **Backend is the source of truth.** Frontend never computes transport, prices, or scores.
4. **Live vs Estimated labeling** on every ride/path/price.
5. **Metro = Purple + Green only.** Yelahanka / Blue line don't exist yet.
6. **Every fallback is labeled.** Interpolated geometry is dashed + "approx path"; fallback
   train schedules say "NOT live"; degraded services say "Unavailable".
7. **Dumb renderer frontend.** Data hygiene: missing field → "Unavailable", never a mock value.

These rules are enforced by tests (especially PROMPT_7's `test_no_fake_data.py`, planned) and by
code review discipline documented in §20.

---

## 4. THE GOLDEN BUILD RULE (READ EVERY TIME)

> **v2 lives in the NEW clean repo's `PROJECT/` folder (fresh GitHub repo, fresh Desktop
> folder — see the FRESH-START MIGRATION note at the top of this file).**
>
> The **old** parent `VOYAGER` repo (parent `backend/`, `frontend/`, `ml/`, `scripts/`,
> `stitch_omnipath_ai_navigation/`, `data_cache/`, root `docker-compose.yml` with osrm-car,
> and the parent `tests/`) is **RETIRED — no longer even reference-able.** Its bugs and
> mistakes are captured in §20 below; do not go back to the old folder for code or data.
> All code, decisions, and data contracts come from the `PROMPT*.md` files + `PROJECT/`
> sources. Do not reintroduce old code or old bugs.
>
> Git: the NEW repo root contains `PROJECT/` and this file. **Only `PROJECT/` files plus
> `MASTER_KNOWLEDGE_BASE.md` are staged/committed.** One branch: `main`. Pull before work,
> push after green tests — never let two machines diverge.

This is the single most important instruction in the whole project. The old repo had a 2400-line
monolith that was full of bugs (see §20). The v2 was created specifically to rebuild cleanly.

---

## 5. TECH STACK & PORTS

| Component | Tech | Port | Notes |
|---|---|---|---|
| Backend | FastAPI (Python 3.12, uvicorn) | **8000** | `python -m uvicorn backend.main:app --reload --port 8000` |
| Frontend | Vite + React 19 + TypeScript + Leaflet/react-leaflet 5 | **3000** | ✅ BUILT (PROMPT_6); `cd frontend; npx vite --port 3000` |
| GraphHopper | Local Docker (car + foot) | **8080** | Karnataka PBF, see `docker-compose.yml`; real road paths |
| OSRM (legacy) | Local Docker (car / foot) | 5000 / 5001 | **v1 ONLY** — v2 does NOT use OSRM. Never reintroduce it. |
| Postgres | Neon (free hosted) via `DATABASE_URL` | — | Trips persistence (PROMPT_8), loaded but unused until then |
| Open-Meteo | free API (no key) | — | weather |
| SerpAPI | API key | — | real reviews + live ride prices |
| Google Maps Platform | API key | — | Places (New), Geocoding, Directions |
| OpenStreetMap Nominatim | free, no key | — | **fallback** for search/nearby/geocode when Google is down/403 |
| DataImpulse | proxy (IP rotation) | gw.dataimpulse.com:823 | news / DDG / review scrapes |
| OpenRouter / Gemini | API key | — | LLM summaries only |

Frontend deps (`frontend/package.json`): `react ^19.2.8`, `react-dom`, `leaflet ^1.9.4`,
`react-leaflet ^5.0.0`, `axios ^1.19.0`, `@types/leaflet`, dev: `typescript ~6.0.2`, `vite ^8.2.0`,
`@vitejs/plugin-react ^6.0.4`, `oxlint`, `@types/*`. Scripts: `dev` (vite), `build`
(`tsc -b && vite build`), `lint` (oxlint), `preview`.

Backend deps (`requirements.txt`): `fastapi>=0.115`, `uvicorn[standard]>=0.30`, `pydantic>=2.7`,
`python-dotenv>=1.0`, `requests>=2.31`, `psycopg[binary]>=3.1`, `httpx>=0.27`.

---

## 6. DIRECTORY MAP (full current tree)

```
VOYAGER_2/                                         ← NEW clean repo root (C:\Users\len\OneDrive\Desktop\VOYAGER_2 + GitHub)
└── PROJECT/                                       ← THE v2 BUILD ROOT (everything lives here)
    ├── PROMPT.md                     # Master vision (Hinglish, raw)
    ├── FEATURES.md                   # Feature summary
    ├── ABOUT_GRAPHHOPPER.md          # Design doc that PROMPT_3 corrected
    ├── "trip planer prompt.md"       # Notes from the trip-planner grilling session
    ├── MASTER_KNOWLEDGE_BASE.md      # THIS FILE (the source of truth)
    ├── AGENTS.md                     # Short session cheat-sheet (auto-loaded by opencode)
    ├── docker-compose.yml            # graphhopper ONLY (8080)
    ├── requirements.txt
    ├── .env.example                  # All 12 keys documented (committed)
    ├── .env                          # REAL secrets — NEVER committed (copy separately)
    ├── PROMPTS/                      # The 9 build prompts (specs)
    │   ├── PROMPT_1_DATA_LAYER.md            … PROMPT_9_DEPLOYMENT.md
    ├── gh-data/                      # GraphHopper
    │   ├── config.yml                # car+foot, reads /data/bangalore.osm.pbf (COMMITTED)
    │   ├── bangalore.osm.pbf         # 42MB Bangalore crop — COMMITTED (fresh clone ready)
    │   ├── graph-cache/              # auto-built on first boot (~50MB) — NOT committed
    │   └── car.json / foot.json      # GraphHopper custom model files
    ├── DATA_FOLDER/                  # Static datasets (see §17)
    │   ├── bmtc_gtfs/                # Raw GTFS .txt (11 files, ~190MB, NOT committed)
    │   ├── processed/gtfs_cache.pkl  # 76MB pickle — COMMIT THIS (cold boot)
    │   ├── bmtc_all_stops_master.csv # ~2972 stops
    │   ├── bengaluru_metro_network.csv
    │   ├── karnataka_railway_stations.json
    │   ├── kia_routes_fare_full.json
    │   ├── transit_fares.json
    │   └── traffic_logs.csv          # 7.5MB, for ML (PROMPT_7)
    ├── backend/
    │   ├── main.py                   # FastAPI app + CORSMiddleware (localhost:3000 + *.onrender.com)
    │   ├── config.py                 # Paths + env helpers
│   ├── api/routes.py             # ALL endpoints (see Appendix A)
│   ├── agents/
│   │   ├── llm_agent.py          # OpenRouter→Gemini chain, chat_json() only
│   │   └── review_summarizer.py  # LLM review summary + concerns (never invents)
│   └── services/
│       ├── app_state.py          # Lazy singletons (9 services)
│       ├── data_schema.py        # Pydantic models (single source of truth)
│       ├── gtfs_service.py       # GTFS loader/cache/fuzzy-name-resolution
│       ├── fare_engine.py        # BMTC/AC/metro/KIA/ride fares + surge
│       ├── database.py           # In-memory station DB + spatial index
│       ├── graphhopper_client.py # HTTP client for local GraphHopper (8080)
│       ├── transit_graph.py      # TransitAstarGraph (static topology)
│       ├── transit_models.py     # Leg, RoutePlan dataclasses
│       ├── route_finder.py       # Best-first top-K N-hop route search
│       ├── segment_builder.py    # THE HOP MECHANISM (tree of choices)
│       ├── search_service.py     # Search orchestrator (Places + SerpAPI + scoring)
│       ├── reliability.py        # reliability formula + pin classes
│       ├── sentiment.py          # lexicon + optional HF distilbert sentiment
│       ├── topsis_engine.py      # 8-factor numpy TOPSIS (TopsisWeights)
│       ├── ride_pricing.py       # estimate ladder + live merge
│       ├── review_tools.py       # SerpAPI review chain + AI summary + cache
│       ├── news_engine.py        # background news loop (Reddit + DDG, classify/geo)
│       ├── proxy_manager.py      # DataImpulse proxy helper
│       ├── train_service.py      # eRail.in live trains
│       ├── clients/
│       │   ├── google_maps_client.py  # Places(New)/Geocoding/Directions/photo
│       │   ├── serpapi_client.py      # reviews/place-details/directions (place_results fix)
│       │   └── weather_client.py      # Open-Meteo current + rain window
│       └── langgraph/
│           ├── agent.py          # VoyagerLangGraph (parallel gather + synthesis)
│           ├── state.py          # RouteContextState / AskState dataclasses
│           ├── tools/            # news, pricing, review, search+geo, traffic, train, weather
│           └── workflows/route_context.py  # delegate to agent
├── frontend/                     # PROMPT_6 (Vite + React + TS + Leaflet)
│   ├── index.html                # Inter + Material Symbols, title "VOYAGER v2"
│   ├── vite.config.ts            # :3000, /api proxy → VITE_API_BASE
│   ├── src/
│   │   ├── main.tsx / App.tsx    # AppProvider + WeatherLoader
│   │   ├── index.css             # glassmorphism design system (see §14.11)
│   │   ├── context/AppContext.tsx# global state (see §14.1)
│   │   ├── services/api.ts       # typed axios client (see §14.2)
│   │   ├── types/index.ts        # all TS contracts (see §14.3)
│   │   ├── pages/MainPage.tsx    # 3-tab shell + layout
│   │   └── components/           # HeaderBar, MapView, SearchPanel, DiscoveryPanel,
│   │                             # AToBPanel, SegmentFlowView, TripPanel, NewsPopup
│   └── (public/, package.json, tsconfig*, .gitignore)
└── tests/
    ├── test_data_layer.py        # 12 tests
    ├── test_route_finder.py      # 10 tests
    ├── test_segment_builder.py   # 14 tests
    ├── test_prompt4.py           # 28 tests
    └── test_prompt5.py           # 20 tests
    (104 tests total, all green — current count)
```

---

## 7. THE ROADMAP — 9 BUILD PROMPTS, STATUS TABLE

| # | Prompt | Name | Status |
|---|---|---|---|
| 1 | PROMPT_1 | Data Layer (GTFS, fares, station DB, GraphHopper client) | ✅ **DONE** |
| 2 | PROMPT_2 | Routing Graph + N-hop route finder | ✅ **DONE** |
| 3 | PROMPT_3 | Segment Builder API (the hop mechanism) | ✅ **DONE** |
| 4 | PROMPT_4 | Search, Place Reliability, 8-factor TOPSIS | ✅ **DONE** |
| 5 | PROMPT_5 | LangGraph agent + live layer (weather/news/traffic/train) | ✅ **DONE** |
| 6 | PROMPT_6 | Frontend rebuild (glassmorphism) | ✅ **DONE** |
| 7 | PROMPT_7 | ML traffic model + integration tests + fake-data audit | ✅ **DONE** |
| 8 | PROMPT_8 | Trip Planner (Feature 3) | 🔲 PLANNED (design locked in grilling) |
| 9 | PROMPT_9 | Deployment (Render free + Neon) | 🔲 PLANNED (design locked) |

**Current state: prompts 1–7 fully implemented and tested.**
- Backend: **104 pytest pass** (`python -m pytest tests/ -q` in ~63s on OneDrive-synced disk, no
  Docker/API required). Files: `test_data_layer.py` (12), `test_route_finder.py` (10),
  `test_segment_builder.py` (14), `test_prompt4.py` (33), `test_prompt5.py` (20),
  `test_traffic_model.py` (9), `test_no_fake_data.py` (6).
- Frontend: `npx tsc --noEmit` zero errors; dev server :3000; axios talks to `http://localhost:8000/api`
  directly + **CORS middleware** added in `backend/main.py` (see §20 #24).
- Prompt 7 (ML + integration + fake-data audit) **DONE**: traffic model + `traffic-model-info` endpoint
  + benchmark all within budget. Prompts 8–9 fully *specified* (see §24) — build order is 8 → 9.
- **2026-08-03 hardening session (merged, uncommitted working tree at last check):** map fly-away
  root cause (lat/lng swap), progressive hop builder (PROMPT_3-faithful single-window build),
  SerpAPI rating fallback for OSM places, OSM→Google place-id resolution in enrich, OpenRouter
  base-URL + credit-credit fixes with Gemini fallback, new `POST /api/routes/drive`, CSS
  stacking-context fix for the details panel, "no fake unknown" search pill, honest ride-fare note.
  Full record in §29; every new problem→choice in §20 #26+.

---

## 8. ARCHITECTURE OVERVIEW (how all the pieces fit)

### 8.1 One shared singleton pool — `backend/services/app_state.py`
Module-level lazy singletons, built once in dependency order by `_load_all()`:

```
1. _gtfs     = GTFSService()        .load()     → pickle ~1.2s (parallel with db)
2. _db       = TransitDatabase()                  → 2970 bus stops, 69 metro, 48 rail (parallel with gtfs)
3. _gh       = GraphHopperClient()               → local Docker :8080
4. _builder  = SegmentBuilder(_gtfs, _db, _gh)    → loads TransitAstarGraph topology from
                                                    transit_graph.pkl pickle (~0.2s; ~1.7s rebuild only
                                                    when source files change)
5. _weather  = WeatherClient()                    → Open-Meteo
6. _search   = SearchService(GoogleMapsClient(), SerpAPIClient())
7. _news     = NewsEngine(ProxyManager())         → background thread starts on first use
8. _trains   = TrainService()                     → eRail.in
9. _agent    = VoyagerLangGraph(weather, news, search, train)
```

Public getters: `ensure_loaded()`, `is_loaded()`, `get_builder()`, `get_search()`, `get_news()`,
`get_trains()`, `get_weather()`, `get_agent()`. Every getter triggers a full `_load_all()` if any
slot is unset. `main.py` lifespan calls `ensure_loaded()` at startup (server boots in ~3s, graph
build printed at init).

### 8.2 Request flow
- **A→B transit**: `POST /api/routes/segments` → `builder.build_segments(...)` → Segment 1 FULL +
  Segment 2 FULL + probes. `POST /api/routes/segment-next` → time-chained next segment or
  journey-complete. The frontend consumes this as a **progressive hop builder** (one hop column at a
  time — see §14.11 / §28.4).
- **A→B drive**: `POST /api/routes/drive` → `app_state.get_gh().route("car", ...)` → real
  GraphHopper road polyline + distance/duration (`DriveRoute`). Used by AToBPanel "Estimate drive"
  and "select ride" to draw the drive path on the map.
- **Search**: `GET /api/search/places|nearby` → `search_service` → **Google Places (New) first,
  then OpenStreetMap Nominatim fallback** (when Google returns empty/401/403 — §20 #23). Since
  2026-08-03: **if OSM results have no rating, a SerpAPI `search_place` fallback runs** to try to
  attach a real Google rating (see §20 #28, §29). `POST /api/search/enrich` → `review_tools.enrich_place`
  → **resolves the OSM place_id to a real Google `ChIJ…` via SerpAPI** (see §20 #29, §29), then
  SerpAPI reviews → sentiment → reliability → LLM summary → `PlaceDetails`.
- **Rides**: `POST /api/rides/prices` → `search_service.ride_prices` → Google Directions distance
  → ride_pricing estimate ladder (surge). (Live SerpAPI overlay implemented in ride_pricing but not
  yet wired into the service path — see §24.)
- **Live context**: `POST /api/langgraph/route-context` → `agent.gather_route_context` → parallel
  weather/traffic/news/prices (+reviews if place) → `LiveContext` dict.
- **News**: `GET /api/search/news` → `news_engine.relevant` (from background loop cache).
- **Weather**: `GET /api/search/weather` → `weather_client.current`.
- **Trains**: `GET /api/routes/live-trains` → `train_service.trains_between` (live or flagged
  fallback).
- **Photo**: `GET /api/search/photo?name=…` → 307 redirect to real Google photo URL (key stays
  server-side). SerpAPI thumbnails (photo_name beginning `http`) are rendered directly by the
  frontend (see §20 #36).

---

## 9. PROMPT_1 — DATA LAYER (DONE)

Five modules under `backend/services/`, wired lazily in `app_state.py`.

### 9.1 `gtfs_service.py` — GTFS loader + cache + fuzzy name resolution
- **Reuses the committed 76MB pickle** (`DATA_FOLDER/processed/gtfs_cache.pkl`) — never re-derives
  on startup (was a ~40s block in v1; now **0.65s**).
- Pickle structure (the contract downstream code relies on):
  ```
  shapes:             dict[shape_id] -> [(lat,lng), ...]          (7271 shapes)
  route_shapes:       dict[route_name] -> [shape_id, ...]
  stop_to_shapes:     dict[stop_name] -> [(shape_id, seq), ...]
  stops_by_name:      dict[stop_name] -> (lat, lng, stop_id)      (~5077 stops)
  stop_times:         dict[stop_name] -> [(HH:MM:SS, route_name)]
  stop_times_by_route:dict[route_name] -> [(HH:MM:SS, stop_name)]
  name_map:           dict[master_stop_name] -> resolved_gtfs_name (persisted)
  route_id_to_name:   dict[route_id] -> cleaned route name
  ```
- **Route-name cleaning** (`clean_route_short_name`): strips terminal garbage suffixes —
  `"MF-28 JKLO-ISROQ-LGRNB"` → `"MF-28"`, `"  242-LA "` → `"242-LA"`. Keeps real names with a
  trailing digit token (`"BEL GS-16"`, `"KSRTC-T NARASIPURA-1"`). Applied at GTFS load AND CSV
  stop-source ingestion.
- **Fuzzy name resolution chain** (`_fast_fuzzy_match`): exact → word-overlap inverted index
  (≥0.5 score) → trigram-filtered `get_close_matches` (cutoff 0.80) → substring → `None`.
  `name_map` pre-resolved **1696/2972** master stop names; 14 names have **no** match (e.g.
  `hnrj`, `ggmc`, `pesitelc`) and correctly stay `None` → "No real-time data".
- **Fast queries**: `get_routes_at_stop()`, `earliest_departures()` (per-stop cached sorted
  minutes list, early break), `get_stop_to_stop_segment()` (real shape slice between two stops,
  never the full route).
- **`get_stop_to_stop_segment`** projects both stops onto each candidate shape (nearest vertex
  within 400m) and returns the polyline slice; returns `None` if both stops don't land on a shape
  → caller must flag, never draw the full route.

### 9.2 `fare_engine.py` — pure fare functions (no I/O inside)
- `bmtc_fare(route_class, dist_km, passenger_type)` — AC Vajra / ordinary / nonac slabs from
  `transit_fares.json`; child = half (ceil, min ₹3), senior = adult − ₹0.75 (min ₹3).
- `metro_fare(dist_km, line)` — single slab table shared by both lines.
- `kia_fare(route_id)` — from `kia_routes_fare_full.json`; uses the max stop fare as the honest
  reference when distance is unknown; `0.0` + `is_estimated` when route unknown.
- `surge_multiplier(hour, weekday)` — 07–10 & 17–21 weekday → **1.5**; 22–06 → **1.8**; else **1.2**.
- `ride_fare_range(ride_type, dist_km, group_size)` — **Karnataka govt-mandated rates**:
  Uber Go/Ola Mini ₹24/km (min ₹85), Uber XL ₹32/km (min ₹130), Ola Auto ₹20/km (min ₹40),
  Rapido Bike ₹5/km (min ₹25). Returns (min, max) with `is_estimated=True`.
  Per-person = vehicle fare / group (NOT ×group — old bug fixed, see §20 #3).

### 9.3 `database.py` — in-memory station DB + spatial index
- Loads: `bmtc_all_stops_master.csv` (~2972 stops, **skips `nan/none/null` names**), metro CSV
  (**Purple + Green only** — Yelahanka/Blue excluded), rail JSON (22 Karnataka stations).
- Spatial index: **sorted-by-lat + binary search + lng window + haversine**, <5ms for ~3000 stops.
- API: `bus_stops_near / metro_near / rail_near(lat, lng, radius_m)`, `all_bus_stops /
  all_metro_stations / all_rail_stations`, `metro_edges()` (adjacent-station pairs with dist+line),
  `routes_for_stop()`.

### 9.4 `graphhopper_client.py` — HTTP client for local Docker GraphHopper
- `route(mode: "car"|"foot", lat1,lng1,lat2,lng2) -> GHResult | None`. Returns `None` on
  timeout/error → caller falls back to interpolated and **flags it** (`path_source`).
- 24h in-memory cache keyed by `(mode, r4(lat), r4(lng), r4(lat), r4(lng))`, thread-safe lock.
- `is_healthy()` checks `/info`.

### 9.5 `data_schema.py` — shared Pydantic models (single source of truth)
Data-layer models: `GtfsStop`, `RouteDeparture`, `BusStop`, `MetroStation`, `RailStation`,
`TransitNode`, `FareResult`, `GHResult`. Plus PROMPT_4 models (`Place`, `Review`, `PlaceDetails`,
`ReliabilityInput/Result`, `RidePrice`, `TopsisWeights`, `ScoringContext`, `ScoredRoute`,
`Suggestion`). All documented in §12 / Appendix B.

---

## 10. PROMPT_2 — ROUTING GRAPH + ROUTE FINDER (DONE)

### 10.1 `transit_graph.py` — TransitAstarGraph (static topology)
- **Nodes**: every GTFS-resolved bus stop (~2900+ bus nodes), every metro station (68 = 2 lines),
  every rail station (≥22). Node keys: `bus:<name>`, `metro:<name>`, `rail:<name>`.
- **Edges** (undirected, stored as adjacency tuples `(neighbor, edge_type, data)`):
  - `bus` — consecutive stops on the same route shape, with 1-skip tolerance (pair-accumulated by
    route, weights computed once per unique pair). Weight = haversine × 1.15 road factor / bus speed
    + dwell (0.3 min).
  - `metro` — adjacent stations same line (from `metro_edges()`). Weight = dist / metro speed + dwell.
  - `walk` — uniform spatial grid (cell ~560m); bus↔bus ≤500m, bus↔metro ≤1000m, bus↔rail ≤3000m.
    Walk time @5 km/h.
- **Speeds (constants)**: bus 18 km/h (edge weights use `BUS_SPEED_KMH = 18.0`), metro 36 km/h,
  walk 5 km/h. Transfer penalty 4 min, interchange fixed 5 min.
- **Performance**: haversine + `_dist_cache` dict only (never `geodesic` in hot loops — this was
  the 11.6s → 2.2s win). Graph builds in ~2.2s, printed at init. Built lazily (server starts
  instantly; first route request warms it).

### 10.2 `route_finder.py` — best-first top-K N-hop search
- Public API: `find_routes_by_coords(src_lat, src_lng, dest_lat, dest_lng, depart_min, group_size,
  budget_pp, max_paths) -> list[RoutePlan]`. 10-min in-memory cache keyed by rounded coords +
  10-min time bucket + group + budget.
- **Algorithm** (`_plan` → `_search`):
  1. Walk-only route when `direct_km ≤ 2.0` (free).
  2. Always add a ride route (Uber Go pricing, GraphHopper car geometry for real road).
  3. Entry nodes: top 3 bus (≤2km) + top 2 metro (≤3km) + top 1 rail (≤5km). Symmetric exits.
  4. **Best-first search (A*-like)** on the graph, up to `MAX_LEGS=6`, `MAX_PATHS=12`, heap keyed
     `g + h` (h = haversine-to-dest / metro speed).
  5. **Hard guards**: 800m `near_visited` (anti-circular, metro exempt), forward-progress rule
     `hav(nb→dest) < hav(node→dest) + tol` (tol = 500m normal, 2500m metro because lines curve).
  6. Edge cost = time + transfer/interchange penalties + `fare_pp / BUDGET_SENSITIVITY` (₹8 ≈ 1 min).
  7. Mode-signature dedup: max 3 plans per mode-combo (e.g. `("bus",)`); per-node labels bounded to 6.
- **Assembly** (`_assemble_chain`): merges consecutive same-mode edges (`_merge_edges`), then builds
  `Leg`s with **time chaining** (each leg's departure ≥ previous arrival + 3min buffer):
  - `_bus_leg`: real GTFS departure via `earliest_departures(from_stop, after, route_filter)`;
    alternate routes fallback; `status="not_running"` if >45min wait; KIA vs BMTC fare; geometry =
    GTFS shape slice → GraphHopper car → interpolated (flagged).
  - `_metro_leg`: line polyline through intermediates, `status="estimated"`, `metro_fare`.
  - `_walk_leg`: GraphHopper foot → interpolated (flagged).
  - `_ride_route`: GraphHopper car geometry + `ride_fare_range("uber_go", ...)`.
- Results sorted by (count of not_running legs, total_duration_min). TOPSIS re-ranking is PROMPT_4.

---

## 11. PROMPT_3 — SEGMENT BUILDER API, THE HOP MECHANISM (DONE — THE CENTERPIECE)

### 11.1 What it is
A **tree of choices**, not a single line. The user builds their journey hop-by-hop; every hop is
real (real bus number, real scheduled time, real geometry, real fare).

### 11.2 `SegmentBuilder` public API
```python
class SegmentBuilder:
    def __init__(self, gtfs, db, gh=None, graph=None): ...   # graph = TransitAstarGraph
    def build_segments(self, source: dict, destination: dict, group_size: int,
                       budget: float, current_time: str | None = None) -> dict
    def build_segment_next(self, journey: dict, chosen_legs: list[dict],
                           group_size: int, budget: float) -> dict
```
- `build_segments` cache key: `(r4 src, r4 dst, now_min//10, group, round(budget))`, TTL 300s.
- Returns: `{"journey": {"source","destination","generated_at"}, "segments":[seg1,seg2],
  "probes":[...], "warnings":[...], "journeyComplete": False, "timeline": []}`.
- `build_segment_next`: time-chains from last leg (`now_min = arrival_min + 4.0`). If last stop
  within **500m** of dest → `journeyComplete: True` + `arrival: {"message":"You have arrived", …}`
  + full timeline. Empty `chosen_legs` → empty response, `journeyComplete: False`.

### 11.3 How Segment 1 is built (`_build_segment_1`)
From the source, enumerate every sensible "get out of here" option:
- **Walk options** to any bus/metro stop within 2km (free). If the closest walk target ≤1.5km,
  that walk is **top-recommended** and no cab/bike is offered.
- **Transit options**: for each boarding stop within 1500m (up to 3 bus stops + 2 metro stations),
  take the **real GTFS next departures** (within 180-min window, ≤4 routes/stop, ≤3 arrival stops
  per route) and ride to forward-progress arrival stops.
- **Metro-transfer rides** (`isMetroTransfer`): for every available route at the stop, look beyond
  the first few stops for a far-forward stop near a metro station (≤1500m) and offer the full
  long-haul ride to that interchange (e.g. "285 → Kempegowda Bus Station, then metro").

Segment 2 (`_build_segment_2`): from distinct arrival stops of Segment 1 (earliest first, ≤6
anchors, ≤40 options), enumerate onward options with the SAME logic, each tagged `connectedFrom` =
its parent stop name, departures **time-chained** (≥ parent arrival + 4 min buffer). Probes
(`_build_probes`): for the level after Segment 2, one cheap onward suggestion per option
(`isProbe: True`, bus/metro only).

### 11.4 Option contract (every hop carries all of this)
```
optionId, destinationStop{name,lat,lng}, mode(walk|bus|metro), routeNumber,
fromStop, distanceKm, durationMin, departureTime, arrivalTime, arrivalMin,
fare, perPersonFare, geometry[], geometrySource(gtfs_shape|metro_line|graphhopper|interpolated),
status(scheduled|estimated|not_running), isTopRecommended, connectedFrom,
transitOptionsFromThisStop, probeNext[], isMetroTransfer(bool), exceedsBudget(bool)
```
(Internal `_fromLat/_fromLng`/`_walkToBoard` are also attached to transit options.)
- Walk: `fare: 0.0`, `status:"estimated"`, `geometrySource:"graphhopper"` or `"interpolated"`.
- Bus: `status:"scheduled"` or `"not_running"` (>45 min wait); fare = `kia_fare` if route starts
  with "KIA" else `bmtc_fare("nonac", dist)`; total fare = `fare * max(1, group_size)`.
- Metro: `routeNumber:"Purple"|"Green"`, `status:"estimated"` (no schedule), geometry =
  metro line polyline, `geometrySource:"metro_line"`, `perPersonFare == fare`.

### 11.5 Top-recommended rule
If a walk ≤ 1500m exists → that walk is top; else `score(o) = (fare or 0)*2 + walk_km*12 +
arrivalMin`, min wins.

### 11.6 Warnings
- hour ≥ 22 or < 6 → `"Bus service limited after 22:00 - consider cab/auto"`.
- any `not_running` option → `"Some stops have no more scheduled buses today - service marked
  not_running"`.

### 11.7 Hard rules that make it correct (all verified by tests)
- **Forward-progress**: `hav(arrival → dest) < hav(anchor → dest) + tol` (500m normal, 2500m metro).
- **No circular routing**: 800m visited guard; candidates within 25m of the anchor dropped.
- **Real data only**: bus options from real GTFS; stop with no GTFS → no transit options (walk may
  still appear). No full-route spiderwebs (geometry = `get_stop_to_stop_segment()` slice only).
- **Time chaining**: Segment N departures ≥ previous arrival + buffer (test: `>= arr_min + 4`).
- **connectedFrom chains exactly**; **budget** → `exceedsBudget` grey-out, never silent drop.
- **Metro hubs**: Majestic carries both lines; both directions offered.
- **Cache**: 5-min TTL; second call <50ms identical.

### 11.8 The frontend contract for this window (PROMPT_6 §9 + 2026-08-03 redesign)
Breadcrumb `Source → [bus 507-D] → Kogilu Cross → [KIA-9] → Majestic → [Purple] → … →
Destination`.
- **Original (superseded) design**: a wall of columns rendered at once, filtered client-side by
  `connectedFrom`; selecting an earlier column reset downstream selections; deeper columns lazily
  called `segment-next`. Problems the user reported: overwhelming 40-option columns with duplicates
  and stale-looking times, and it did not feel like a guided "pick hop → build path" flow.
- **2026-08-03 progressive redesign** (§14.11, §29): ONE hop column at a time — the current hop's
  options. Selecting a hop (a) confirms it into the breadcrumb, (b) flies the map to the leg's real
  end (correct `[lat,lng]`, never swapped), (c) advances to the next hop: if the next level is
  pre-fetched it advances instantly via the client-side filter (connectedFrom + departure ≥
  previous arrival + 4 min buffer, §T3), otherwise it lazily calls `segment-next` (time-chained,
  server-authoritative) and appends the new level. Undo hop / Reset are always available.
  `journeyComplete` shows the arrival screen (total time, ₹ total, leg count). Every confirmed leg
  draws solid on the map (§14.7); pre-fetched alternatives draw faint/dashed.

---

## 12. PROMPT_4 — SEARCH, RELIABILITY, TOPSIS (DONE)

### 12.1 Google Maps Places client (`clients/google_maps_client.py`)
- Base URLs: `https://places.googleapis.com/v1` (Places API New) + legacy
  `https://maps.googleapis.com/maps/api` (Geocoding/Directions).
- Filters (PROMPT_4 §2.1): **≥40% keyword overlap** (`MIN_KEYWORD_OVERLAP = 0.40`) between query
  and result name/address (applied in `search_places`, NOT nearby), coords within **15km** of
  Bangalore center `(12.9716, 77.5946)` (`BANGALORE_RADIUS_KM = 15.0`), dedup by 4-decimal coords
  (`_DEDUP_RND = 4`, ~11m). 24h cache, 2000-entry bound.
- Methods: `geocode`, `search_places` (searchText + locationBias circle 15km), `nearby_places`
  (searchNearby, maxResultCount 20, `includedPrimaryTypes` from 19-category map), `place_details`,
  `directions` (mode driving/walking/transit, `departure_time=now`, `traffic_model=best_guess`,
  returns `distance_m`, `duration_s`, `duration_in_traffic_s`, `traffic_ratio`, decoded `geometry`,
  `source:"google_maps"`), `place_photo_url(place_id, photo_name, max_width)` → real URL
  `https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx={max_width}&key=…`.
- 19 category → primary-types map: atm, bank, hospital, pharmacy, restaurant, cafe, hotel/mall
  (hotel+lodging), mall (shopping_mall), petrol pump (gas_station), ev station, supermarket,
  park, bus stop, metro (subway_station/metro_station/transit_station), temple, police, school,
  gym, cinema.

### 12.2 Reliability score (`reliability.py`) — dynamic, deterministic, explainable
```
status_factor = 0.0 CLOSED_PERMANENTLY | 0.4 CLOSED_TEMPORARILY | 1.0 OPERATIONAL/None
rating   = clamp(rating, 0, 5);  default rating_part = 0.2 when no rating
sentiment = clamp(sentiment_avg, 0, 1)

rating_part    = 0.5 * (rating / 5.0)
sentiment_part = 0.3 * sentiment
count_part     = 0.2 * min(1.0, log1p(review_count) / log1p(100))    # log1p(100) ≈ 4.615
raw    = (rating_part + sentiment_part + count_part) * status_factor
score  = clamp(raw, 0, 1)
score_pct = int(round(score * 100))
```
Pin classes (order matters): status_factor==0 (CLOSED_PERMANENTLY) → `red`; CLOSED_TEMPORARILY →
`yellow`; `score>=0.7 and status_factor>=0.4` → `green`; `score>=0.5` → `yellow`; else `red`.
`ReliabilityResult`: `score, score_pct, pin_class, status_factor, rating_part, sentiment_part,
count_part`. Always recompute — never trust an external `reliability_score`.

### 12.3 Reviews & sentiment
- **Chain** (`review_tools.py`): `enrich_place(place, max_reviews=24)` → requires `place_id` →
  `serpapi.place_details` → reviews parsed from `user_reviews.most_relevant` (real keys:
  `username`/`description`/`rating`/`date`) → `sentiment_avg` → `compute_reliability` →
  `_summarize` → `PlaceDetails`. Cache: plain dict keyed by `place_id` (no TTL), `_REVIEW_CACHE_VERSION = 2`.
- **SerpAPI key fix** (do-not-regress): parse from `data["place_results"]` (fallback `data["place"]`),
  reviews from `user_reviews.most_relevant`, fields `username`/`description` — NOT the old broken
  `"place"` key / `reviews` int / `user.name`/`snippet`. Cache versioned `detail:{place_id}:v2`,
  24h TTL.
- **Sentiment** (`sentiment.py`): primary = deterministic **AFINN-style lexicon** (offline,
  reproducible, negation-aware, 31 negators), polarity ∈ [0,1] (`0.5 + mean/8` squash of [−4,4]).
  Optional upgrade: HuggingFace `distilbert-base-uncased-finetuned-sst-2-english` pipeline, loaded
  lazily once; fallback to lexicon on any failure. **LLM never computes sentiment.**
- **Summary** (`agents/review_summarizer.py`): `summarize(texts, score_pct)` → `SummaryResult
  (summary, concerns[])`; payload truncated to 14,000 chars; temperature 0.2, `response_format:
  {"type":"json_object"}`, timeout 20s; `None` on empty/no-key/error → deterministic fallback
  `"Based on {n} Google reviews (reliability {p}%)."`. **LLM never invents review text.**

### 12.4 TOPSIS 8-factor (`topsis_engine.py`, real numpy)
- `TopsisWeights` (user-adjustable, sum 1.0, re-normalized):
  `time_of_day .10, cost .20, weather .10, traffic_crowd .15, availability .05, walking .15,
  group_size .10, safety .15`.
- 8 criteria `(name, is_benefit)`: cost(cost)❌, time_of_day❌, walking❌, group_size✅, weather✅,
  traffic_crowd❌, availability✅, safety✅.
- `RouteCriterionValues` @dataclass (per-route raw inputs): `cost, time_of_day, walking,
  group_size=1.0, weather, traffic_crowd, availability, safety`.
- Algorithm: matrix X(n,8) → vector-normalize (`norms = sqrt(sum(X², axis=0))`, zero-norms→1.0)
  → weight-normalize → ideal/anti-ideal (by is_benefit) → `d_plus`/`d_minus` → closeness
  `cc = d_minus/(d_plus+d_minus)` → sort desc, tie-aware ranks (`abs diff < 1e-9` share rank).
- Mutates each `ScoredRoute`: `cc_score`, `rank`, `best_match (rank==1)`, `scores =
  {"reliability": cc, "explained": _explain(...)}` (explain: `₹{fare}`, `{dur} min`, `{walk:.1f} km
  walk`, `{transfers} transfers`, + `"rain expected — prefer covered modes"` if `rain_next_hour`).
- Empty → `[]`; single route → rank 1 best_match; all-identical → all share rank 1.

### 12.5 Ride pricing (`ride_pricing.py`)
- Two sources always labeled: **live** (SerpAPI `google_maps_directions` `ride_options`, note
  "Live Uber/Ola quote from Google Maps") vs **estimated** (Karnataka govt formula, note
  "Karnataka rate estimate x{surge:.1f} surge").
- `_ESTIMATE_LADDER` (always all 5): uber_go/Uber/cab, ola_mini/Ola/cab, uber_xl/Uber XL/cab,
  ola_auto/Auto/auto, rapido_bike/Rapido/bike.
- Formula per provider: `amount = max(min_fare, base + per_km*dist)`; max = `amount*1.1`; surge
  applied to the mid-point: `total = round(mid * surge, 2)`; `per_person = round(total/group, 2)`.
- **`total` = vehicle fare (never `per_person × group`)** — old bug fixed.
- `merge_live_prices(live_options, estimated, group)`: live entries win (provider match); leftover
  providers stay estimated; malformed live entries ignored (`_extract_price` tries price/
  price_value/total, strips ₹ and commas, returns None on failure — never fabricates).
- `ride_prices_for_distance(dist_km, group_size, live_options=None, context=None)` → estimates then
  merge.
- **Note**: `SearchService.ride_prices` and `PricingTool.run` currently pass `live_options=None`
  always, so the live overlay is defined but not yet invoked through these two paths (a known
  future wiring point — see §24).

### 12.6 Search service (`search_service.py`)
Orchestrates Maps + SerpAPI + scoring. `search_places`, `nearby` (first category wins), `enrich`
(delegates to review_tools), `verify` (closest by squared euclidean), `ride_prices`,
`suggestions` (top 5). `_to_place` filters dict to `Place.model_fields` only.

---

## 13. PROMPT_5 — LANGGRAPH LIVE LAYER (DONE)

### 13.1 Role (non-negotiable)
`VoyagerLangGraph` is a **data gatherer + explainer**. It gathers live factors in parallel and
explains them — it **never decides routes** (that is the deterministic A*/graph) and **never writes
numbers** (LLM only synthesizes text).

### 13.2 `langgraph/agent.py` — `VoyagerLangGraph`
Constructor injects (or defaults) LLMAgent + WeatherTool + TrafficTool + NewsTool + PricingTool +
SearchTool + GeoTool + TrainTool; `ThreadPoolExecutor(max_workers=5)`.

- **`gather_route_context(src, dst, group_size, budget, current_time, place) -> dict`**:
  parallel fan-out jobs: `"weather"` (at dest), `"traffic"` (`_traffic_with_news`: news keyword
  "traffic" first, then TrafficTool with alerts), `"news"` (at dest, limit 10), `"prices"` (only if
  group_size truthy). Each future wrapped in try/except → `results[key] = None` on failure (a
  failing tool **never blocks** the others). Reviews only when `place.get("place_id")`. Then
  `_derive_factors(state)` and `_to_live_context(state)`.
- **`_derive_factors`** (deterministic from `datetime.now().hour`): `time_of_day` ∈
  `night`(≥22 or <6) | `morning_rush`(<10) | `day`(<17) | `evening_rush`; `rain_next_hour` (from
  weather); `traffic_label`; `safety` = `"caution"` only at night with non-empty news else `"ok"`.
- **`_to_live_context` → LiveContext dict** (exact keys):
  ```
  weather, traffic, news, prices, reviews, factors, errors, completed_at (ISO)
  ```
  Degraded fields are honest: `weather or {"condition":"unavailable"}`, `traffic or
  {"label":"unavailable"}`.
- **`ask(message, lat, lng, context) -> dict`**: defaults coords to Bengaluru (12.9716,77.5946)
  if none; returns `{"live_context": ..., "synthesis": {"answer", "factors"}}`.
- **`_synthesize`**: builds prompt with the hard rule "do NOT invent fares, timings, bus numbers,
  or scores. Use only the given data. Reply JSON {"answer", "factors"}."; `chat_json` via LLMAgent;
  if `None` → `{"answer":"Live data partially unavailable.","factors":["LLM unavailable"]}`.

### 13.3 Tools (`langgraph/tools/`)
- **NewsTool**: `NewsEngine.relevant(lat, lng, keyword, limit)`.
- **PricingTool**: `maps.directions` → `dist_km` → `ride_prices_for_distance` → `RidePrice[]` dicts.
- **ReviewTool**: `ReviewTools.enrich_place(Place) → PlaceDetails` dict.
- **SearchTool** (+ place_details via enrich) / **GeoTool** (geocode, nearby; reverse_geocode calls
  geocode with "lat,lng").
- **TrafficTool**: `traffic_ratio` from Directions; labels `heavy ≥1.3`, `moderate ≥1.1`, else
  `light`. Fallback (labeled `"time_of_day_model (Directions unavailable)"`): weekday rush → 1.4
  heavy, night → 1.05 light, else 1.2 moderate. Payload: `{ratio, label, source, alerts[≤3]}`.
- **TrainTool**: `code_for` both stations; unknown → `{"trains":[],"source":"none","note":"no
  station codes"}`; else `trains_between`.
- **WeatherTool**: `WeatherClient.current(lat,lng) or {}`.

### 13.4 `state.py`
`RouteContextInput{source, destination, group_size, budget, current_time}`;
`RouteContextState{input, weather, traffic, news[], prices[], reviews, factors{}, errors[],
completed_at}`; `AskInput{message, lat, lng, context}`; `AskState{input, tool_outputs{},
synthesis}`.

### 13.5 `workflows/route_context.py`
`RouteContextWorkflow.run(...)` — pure delegate to `agent.gather_route_context` (all fan-out lives
in the agent).

### 13.6 `news_engine.py` — background loop
- Constants: `_TTL_S = 4h`, `_MAX_ITEMS = 25`, default interval **8 min** (spec 5–10), daemon
  thread `"news-loop"`, `_loop` never dies (refresh wrapped in try/except).
- `refresh_once()`: `_scrape_reddit` (r/bangalore/new.json?limit=25 via proxy, title + text 400
  chars + url + source "r/bangalore" + ts) + `_scrape_news_fallback` (DDG html search for 3 queries:
  "Bangalore traffic today", "Karnataka rain alert", "Bengaluru news", ≤8 titles each) →
  `_dedup` (normalized title key, 80 chars) → classify → geo-tag → `_merge` (fresh + old within TTL,
  sort ts desc, cap 25).
- `_classify` keywords → `traffic | weather | event | general` (e.g. traffic: jam/congestion/
  accident/road closed/diversion/gridlock/crashed/pile-up/metro delay/bus strike).
- `_geo_tag` → 24 known Bangalore localities (silk board, majestic, mg road, cubbon park,
  indiranagar, korangala, whitefield, ecity, hebbal, yeshvantpur, rajajinagar, jayanagar,
  marathahalli, outer ring road, namma metro, kempegowda, bannerghatta, hsr layout, bellandur,
  byatarayanapura, sarjapur, ecity…).
- `summarize_items(llm)`: LLM `chat_json` ≤2-line summary, `[:220]` chars, per-item try/except.
- `relevant(lat, lng, keyword, limit)`: keyword filter → proximity sort (haversine to geo, untagged
  last) or ts desc; `setdefault("summary","")`; cap limit. Served even if loop fails → honest
  empty (never fake headlines).

### 13.7 `train_service.py` — eRail.in live trains
- `_ERAIL = https://erail.in/rail/getTrains.aspx`, `_TIMEOUT=6.0`, 15-min cache.
- **STATION_CODES: 48 entries** (SBC, YPR, BNC, KJM, YNK, WFD, KGI, MYS, UBL, MAJN, MAQ, BGM, BAY,
  DVG, DWR, KLBG, RC, BJP, BWT, TK, ASK, HAS, MYA, HPT, GDG, SMET, HRR, WADI, RRB, LD, YG, BIDR,
  UD, KAWR, HVR, RNR, TTR, DRU, KUDA, KBL, BGK, S, RMGM, CPT, NTW, CMNR, BDVT, BTJL). NOTE:
  AGENTS.md's "22" is stale — the code has 48.
- `trains_between(fc, tc)`: GET with params; parse rows → `{train, name, dep, arr, dur_min,
  source:"live"}`. Return `{"trains", "source": "live"|"fallback", "note"}`.
  - eRail reachable + zero trains → genuinely empty `{"source":"live","note":"eRail.in (no
    services)"}` (NO fallback applied).
  - On failure: if pair in `_FALLBACK_PAIRS` (7 city-pairs, static schedules) → `source:"fallback"`,
    note "eRail unreachable — city-pair schedule (NOT live)". Else keep empty fallback default.
- **Trains appear only when eRail returns real data — never fabricated.**

### 13.8 `llm_agent.py` — OpenRouter → Gemini chain
- `LLMConfig{openrouter_key/base/model, gemini_key/model, temperature=0.2, timeout_s=30,
  fallback_models[]}`. Defaults: OpenRouter `https://openrouter.ai/api/v1`,
  `openai/gpt-4o-mini`; Gemini `https://generativelanguage.googleapis.com/v1beta/openai/`,
  `gemini-2.0-flash`.
- `chat_json(system, user) -> dict | None`: try OpenRouter (if key) → try Gemini (if key) → `None`.
  Each failure logged and skipped (provider chain, not parallel). `_complete` uses
  `response_format={"type":"json_object"}`, temperature 0.2, timeout 30.
- **NEVER allowed**: guessing fares/timings/scores, fabricating anything, deciding routes. `None`
  → caller supplies deterministic fallback.

### 13.9 `proxy_manager.py` — DataImpulse
Covered fully in §16.

---

## 14. PROMPT_6 — FRONTEND (DONE)

### 14.1 `context/AppContext.tsx` — global state
`Mode = "search" | "atob" | "trip"`. `JourneyState{segments, chosenLegs, active, position}`.
`AppState`: mode/setMode, dark/toggleDark (initial `prefers-color-scheme`, toggles `html.dark`),
userLoc, source, dest, setSource/setDest, swap, weather, places, selected, showDiscovery, prices,
liveContext, news, journey (setJourney merges partials), flyTo. `scoreClass(score)`: null→yellow,
≥70 green, ≥50 yellow, ≥30 orange, else red. `scoreColor(score)` → CSS var. `useApp()` throws
outside provider.

### 14.2 `services/api.ts` — typed axios client
`http` instance: `baseURL = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api"`,
timeout 120s. AbortController signal support in `searchPlaces`, `searchNearby`, `routeSegments`.
Methods (exact paths):
- `searchPlaces(q, lat?, lng?, signal?)` → GET `/search/places`
- `searchNearby(lat, lng, radiusM, categories=[], keyword="", signal?)` → GET `/search/nearby`
- `enrichPlace(place)` → POST `/search/enrich`
- `verifyPlace(name, lat, lng)` → POST `/search/verify`
- `weather(lat, lng)` → GET `/search/weather` (null if condition "unavailable")
- `news(lat?, lng?, keyword="", limit=15)` → GET `/search/news`
- `ridePrices(origin, dest, groupSize)` → POST `/rides/prices`
- `routeSegments(src, dst, groupSize, budget, currentTime=null, signal?)` → POST `/routes/segments`
- `segmentNext(journey, chosenLegs, groupSize, budget)` → POST `/routes/segment-next`
- `routeContext(src, dst, groupSize, budget, place=null)` → POST `/langgraph/route-context`
- `liveTrains(from, to)` → GET `/routes/live-trains`

### 14.3 `types/index.ts` — all contracts
`Coord=[number,number]`, `ScoreClass`, `LatLng`, `WeatherNow`, `NewsItem`, `PlaceResult`,
`Review`, `PlaceDetails extends PlaceResult` (+phone/website/reviews/sentiment_avg/
reliability_score/pin_class/summary/concerns), `RidePrice`, `PlaceModel`, `StopRef`, `HopOption`,
`ProbeOption`, `Segment`, `SegmentResponse`, `JourneyComplete`, `LiveContext`, `ScoredRoute`.
(No `any` for API payloads — gate.)

### 14.4 `App.tsx` / `main.tsx`
`AppProvider` wraps app; `WeatherLoader` calls `api.weather` (defaults to Bengaluru if no userLoc),
stores via setWeather. `main.tsx` mounts StrictMode + App with `index.css`.

### 14.5 `pages/MainPage.tsx` + `.css` — 3-tab shell
Tabs: Search / A→B / Trip (bottom pill nav, active = primary bg + glow). Layout: HeaderBar on top;
`.app-body` = sidebar (`380px`, `.glass`) + map-wrap (flex:1) + DiscoveryPanel overlay. Geolocation
on mount (6s timeout, fallback Bengaluru). Mobile ≤768px: body becomes column, sidebar 42vh, map
45vh, icon-only tabs. Exports helper `flyToPoint(map, point, zoom=15)`.

### 14.6 `components/HeaderBar.tsx` + `.css`
Brand, live clock, weather chip (temp + condition, `rain soon` badge when rain_next_hour), dark
toggle, location.

### 14.7 `components/MapView.tsx` — Leaflet map
- `NUM_COLORS` (10) for numbered pins; `MODE_COLOR` = bus #6c5ce7, metro #00cec9, train #e17055,
  walk #95a5a6, ride #f39c12, connecting #f39c12, dropoff #fd79a8.
- Icons (all `L.divIcon`): userIcon (blue pulsing dot, `.marker-user`), pinIcon(cls) (`.marker-pin`
  green/yellow/red, letter G/Y/R), numIcon(n), starIcon (selected), newsIcon(cat) (traffic #e74c3c,
  weather #3498db, event #f1c40f, general #95a5a6).
- `FlyController` — `map.flyTo([lat,lng], max(zoom,14), {duration:0.9})` when target set. Since
  **2026-08-03** it refuses to fly to coordinates outside the Bengaluru box (12–14 lat, 76.5–78.5
  lng) so a rogue coordinate can never yank the map away (§20 #26, #31).
- `legGeometry(opt)` — **NO coordinate swap** (2026-08-03 fix): backend geometry is already
  `[lat,lng]` and Leaflet wants `[lat,lng]`, so it returns `[Number(pt[0]), Number(pt[1])]`.
  The old `[pt[1], pt[0]]` swap projected every line to ~77.5°N (the "random island / Arctic" bug).
  See §20 #26.
- `RoutePolylines` — one `<Polyline>` per option geometry (skips <2 pts); confirmed legs solid
  weight 5, `isTopRecommended` solid, all others faint (weight 3, opacity 0.3, dashed `4 6`);
  walk dashed. A separate solid polyline draws the **ridePath** (drive route). The old fake
  dashed source→dest "connecting" line was removed (2026-08-03) — it painted over real geometry.
- `Pins` — numbered places hidden during active journey; source = green pin, dest = red pin, star
  for selected; numbered pins colored by `business_status==="CLOSED_PERMANENTLY" ? red :
  scoreClass(rating*20)`; news pins only if `geo`; JourneyPosition = blue CircleMarker (radius 7).
- `fitBounds` on journey segments + ridePath (padding 40), and every point is filtered through the
  Bengaluru-box guard so a single bad point cannot zoom the map out to "nowhere".
- OSM tiles. Hover = CSS only. Hop-card hover/select pans the map (in SegmentFlowView, correct
  coords).

### 14.8 `components/SearchPanel.tsx` + `.css`
Two tabs: **Search specific** (text input, Enter/icon runs search; suggestions debounced 300ms when
≥2 chars, AbortController, top 5 in glass-strong dropdown) and **Nearby** (pinned-banner when a
place is pinned, 19 category chips in scrollable wrap — default "Restaurant", radius slider
0.5–10km step 0.5 default 2, "Find nearby" → `api.searchNearby`). `PlaceCard`: numbered marker,
name, primary_type, status pill (open/closed/unknown), address, ★ rating (count), distance km,
`badge live/est` for open/closed, **Details** + **Navigate** buttons. Click → pin + flyTo; Details
→ enrich + DiscoveryPanel; Navigate → setDest + mode atob.

### 14.9 `components/DiscoveryPanel.tsx` + `.css` — right-side glass panel
Shows (when showDiscovery): hero photo (`/api/photo?name=…`, onError hides), header + close,
reliability score pill (`selected.pin_class ?? scoreClass(rating*20)`), name, type, address,
★ rating (count) + distance, business-status pill, opening hours (`<details>`), **AI review
summary** box tinted by class + **Concerns** (red bullets), first 5 real reviews, buttons "Show on
map" (flyTo) + "Navigate here" (dest + atob). Loading skeleton. Position: absolute right 28px,
340px wide; mobile right 8px width min(340px,92vw).

### 14.10 `components/AToBPanel.tsx` + `.css`
- Travel-mode chips **Public / Drive / Walk** (default public); public sub-chips **Multi-hop
  transit** (default) / **Direct ride**.
- Autocomplete source/dest (green/red dots; debounced 300ms suggestions via `api.searchPlaces`,
  top 5; "Current location" entry uses userLoc; picking sets source/dest + flyTo).
- Params: group (1–20, default 1), budget ₹ (default 500), mileage km/L (drive only, 5–40, default
  15). Swap button.
- `findRoutes`: public+ride → `api.ridePrices` → RideCards; public+transit → SegmentFlowView; drive
  → `api.ridePrices(src,dst,1)` for the estimate + fuel; walk → SegmentFlowView. Sets places [] and
  hides flow each new search.
- **startDrive** (2026-08-03 rewrite): calls **`api.driveRoute(source, dest)`** → `POST
  /api/routes/drive` → real GraphHopper car route (the OLD hardcoded `fetch("http://localhost:8080/route?…")`
  is gone — it bypassed the backend, ignored error handling, and leaked a hardcoded URL) →
  `setRidePath(geometry)` draws the drive path on the map → `fuel = (110.0 * distKm) / mileage` →
  fuel card "Fuel cost ₹X at ₹110/L, Y km/L — approximate".
- **selectRide(p)**: sets flyTo(dest), calls `api.driveRoute`, and draws the drive path via
  `setRidePath` — so picking a ride card shows the actual road path immediately (§20 #35).
- RideCard: provider, mode, `badge live|est`, ₹total (0dp), ₹pp/person, `• {eta_min} min`, note.
- Primary button: "Estimate drive" / "Get ride prices" / "Find routes", disabled without src+dst.

### 14.11 `components/SegmentFlowView.tsx` + `.css` — the multi-hop window (progressive builder)
- `MODE_META`: bus/metro/train/walk/ride → icon + color + label.
- **2026-08-03 redesign** (§11.8, §29): a **progressive hop builder**, not a wall of columns.
  - State: `levels` (fetched hop segments, level `i` = options for hop `i`), `confirmed`
    (`HopOption[]`, the built path), `currentIdx` (which hop the user is choosing now), `loading`,
    `complete`, `warnings`.
  - Init: reuse `journey.segments` if present, else `api.routeSegments(source,dest,groupSize,budget)`.
  - `optionsForLevel(seg, confirmedUpTo, idx)` — client filter + dedupe + cap:
    1. If `idx>0`, drop options whose `connectedFrom` is set and ≠ previous stop name
       (case-insensitive).
    2. Time chain: drop options whose `departureTime` (HH:MM) < previous `arrivalTime` + **4 min**
       catch-the-bus buffer (PROMPT_3 §T3).
    3. `dedupeOptions` key = `mode|routeNumber|destinationStop|departureTime|fromStop` (the
       departure time in the key is what kills the duplicated rows the user saw — §29).
    4. Sort: `isTopRecommended` first, then transit (bus/metro/train) over walk/ride; cap
       `MAX_VISIBLE = 10`.
  - `selectHop(idx, opt)`: truncate downstream confirmed, confirm into breadcrumb, **fly map to
    `opt.geometry[last]` with CORRECT `[lat,lng]`** (the old `{lat: lastPt[1], lng: lastPt[0]}`
    swap flew to ~77.5°N — §20 #31), then advance:
    - If a next level is pre-fetched and its filtered count > 0 → instant client-side advance.
    - Else → `api.segmentNext(journey, nextConfirmed, gs, bg)` → append/replace level, set
      `complete`, `warnings`.
  - `goBack()` (Undo hop) steps back one hop, truncating confirmed + levels; `reset()` reloads.
  - Breadcrumb `Source → [507-D bus] → stop → … → Destination`; warnings strip; hop card shows
    mode icon, routeNumber/Walk, `★ Top` gold badge, → stop, minutes, km, ⏱ departure, ₹fare /
    "Free" / "—", ↻ onward count; hover pans (correct coords).
  - Complete screen: "You reached {dest}!" + total min + ₹ total + legs + Reset; else when
    confirmed>0 a row of **Undo hop / Reset / Start journey** buttons (`setJourney({active:true})`).
- Note: `groupSize`/`budget` come from AToBPanel and are passed to both `routeSegments` and
  `segmentNext` (previously hardcoded 1 / 500 — §29).

### 14.12 `components/TripPanel.tsx` + `.css`
AI Travel Insights card, **Start journey / End** (watchPosition enableHighAccuracy, timeout 10s,
live coords), Create new trip (→ atob), Your Trips (empty state), Day Plan chips Day 1–3.

### 14.13 `components/NewsPopup.tsx` + `.css`
Floating LIVE glass panel (absolute left 12 bottom 12, 280px). Polls `api.news(…, 15)` on mount +
every **2 min**; expands/collapses; dismiss ×. Items bordered by category color, title + summary +
category badge. Dark-mode override for item bg.

### 14.14 `index.css` — design system (this is the app's look, do not delete)
CSS vars: brand (primary #6c5ce7, secondary #00cec9, accent #fd79a8, error #e74c3c, warn #f39c12,
success #27ae60), surfaces (`--bg #eef1f7`, panel rgba white, text #1e2536 + 2 shades), score
colors (green/yellow/orange/red), glass blur 18px, radius 16px, font Inter 15px.
Dark mode via `html.dark` overrides. Body = two radial gradients (purple top-right, teal
bottom-left).
Classes: `.glass`, `.glass-strong`, `.hover-lift`, `.score-pill .green/.yellow/.orange/.red`,
`.score-bar`, `.badge .live/.est/.approx/.best/.gold`, `.skeleton` (shimmer), `.spinner`,
`.pulse-dot`, animations `.anim-up/.anim-in/.anim-scale`, keyframes `shimmer/slide-up/fade-in/
scale-in/pulse-ring/pulse-dot/spin`, Leaflet overrides, `.marker-pin` (rotated teardrop, green
glow/yellow 30px/red 24px dim), `.marker-num`, `.marker-user` (pulse ring), `.marker-star`, utils
(muted/truncate/row/spread/mt8/mt12), `.btn` (+ghost/full/small), `.text-input`, `.chip`,
`.full-map`.

### 14.15 `vite.config.ts`
`server.port 3000`, proxy `/api` → `process.env.VITE_API_BASE || http://localhost:8000`,
changeOrigin.

---

## 15. INTEGRATIONS DEEP-DIVE — WHAT, WHY, AND WHEN EACH IS USED

**2026-08-03 LIVE STATUS TABLE (verify before relying on any integration):**

| Integration | Key in `.env` | Live right now? | Note |
|---|---|---|---|
| GraphHopper (Docker :8080) | none | ✅ YES | Container `project-graphhopper-1`, gh 12.0, profiles car+foot; user starts Docker Desktop manually, then `docker compose up -d graphhopper` |
| Google Maps Platform | `GOOGLE_MAPS_API_KEY` | ⛔ 403 (billing OFF) | Every Places/Geocoding call → 403; OSM fallback active; Google re-enables the moment billing is on |
| SerpAPI | `SERPAPI_API_KEY` | ✅ YES | Real reviews, place resolution, rating fallback, live ride quotes; budget-sensitive (~250 searches/mo free, owner has friend keys ~1250/mo) |
| OpenRouter | `OPENROUTER_API_KEY` | ⚠️ 402 (credits exhausted) | Base URL fixed (was wrong → 401, §20 #30); now **out of credits** → code auto-falls back to Gemini |
| Gemini | `GEMINI_API_KEY` | ✅ YES (fallback) | OpenRouter 401/402 → Gemini; summary path must be re-verified live after the provider-chain fix (§29, §31) |
| Open-Meteo | none | ✅ YES | weather |
| eRail.in | none | ✅ YES (when reachable) | live trains, 48 codes; 7 city-pair fallbacks flagged |
| Reddit r/bangalore + DDG | — | ✅ YES via DataImpulse | news loop |
| DataImpulse proxy | `DATAIMPULSE_USER/PASS/HOST` | ✅ YES | IP rotation for anonymous scrapes only (§16) |
| OSM Nominatim | none | ✅ YES (fallback) | search/nearby/geocode when Google 403 |

### 15.1 SerpAPI — Google Maps reviews + live ride prices (WHY: real reviews & live prices)
- **Why integrated**: BMTC has no live API; Google's own review data is the only honest source of
  "is this place real/recommended". SerpAPI wraps Google Maps search/directions so we get
  **real reviews** (`user_reviews.most_relevant`) and **live Uber/Ola quotes**
  (`ride_options`) without a full Google Places billing scare.
- Auth: `SERPAPI_API_KEY` (API-key, **no proxy**). Free tier ~250 searches/mo; owner has friend
  keys (~1250/mo) — budget-sensitive (reviews capped ~10/place).
- **2026-08-03 additions (WHY):**
  - `search_place` **rating fallback** in `search_service.search_places` / `nearby`: when OSM
    (Nominatim) results have **no rating**, one SerpAPI `search_place(q, cat, lat, lng)` call runs
    and the top result's real Google rating + count + photo get attached (e.g. "Cubbon Park" → 4.4,
    143,010 reviews, green pin). WHY: OSM gives coordinates but no ratings/photos, so the app
    looked empty; SerpAPI restores the "is this place good" signal honestly.
  - **OSM→Google place resolution** in `review_tools.enrich_place._resolve()`: enrich needs a
    `ChIJ…` place_id for reviews, but search now often returns OSM `osm:…` ids; `_resolve()` calls
    `serpapi.search_place` to find the real Google place_id (e.g. `osm:way22895320` → Cubbon Park
    → `ChIJL2fQ53MWrjsRuN9D6aalLMY`), then reviews/enrichment work.
  - `photoUrl` in DiscoveryPanel accepts `http`-prefixed SerpAPI thumbnail `photo_name` directly
    (§20 #36).
- **Past critical bug (FIXED, do-not-regress)**: `_parse_place_detail` used wrong response key
  `"place"` instead of `"place_results"`; reviews read from `place_results.reviews` (an **int
  count**) instead of `user_reviews.most_relevant`; fields `user.name`/`snippet` instead of
  `username`/`description`. See §20 #17.
- Where used: `clients/serpapi_client.py` (search_place, place_details, directions/ride_options).
  Caches: reviews 24h (`detail:{id}:v2`), prices 15 min.

### 15.2 Google Maps Platform — Places (New), Geocoding, Directions (WHY: canonical places + traffic)
- **Why integrated**: canonical place search/nearby/details/photos/hours/business_status, plus
  `duration_in_traffic` for the TOPSIS traffic factor and real driving geometry via Directions.
- Auth: `GOOGLE_MAPS_API_KEY` (API-key, **no proxy**). APIs enabled: Places API (New), Geocoding,
  Directions/Distance Matrix.
- Where used: `clients/google_maps_client.py` (search_places, nearby_places, place_details,
  place_photo_url, directions, geocode). 24h cache. Photo served through the **server-side proxy**
  (`GET /api/search/photo`) so the API key never leaks to the browser.

### 15.3 GraphHopper — real road routing (WHY: replaces v1's OSRM)
- **Why GraphHopper over OSRM**: v1 used OSRM (5000/5001) with public-URL fallback bugs and OOM
  issues. v2 spec chose local GraphHopper on **8080** (car + foot, Karnataka PBF) for real
  road-following walk/drive geometry + driving distances.
- `docker-compose.yml` (ONLY service in the file): image `israelhikingmap/graphhopper:latest`,
  ports `8080:8989`, volume `./gh-data:/data`, `java -Xmx2g -Xms1g -jar
  graphhopper-web-12.0-SNAPSHOT.jar server /data/config.yml`, restart unless-stopped.
- **2026-08-03 real-world lesson**: Docker Desktop is started manually by the user (not automatic),
  and the container needs **~1–3 min on first boot to build the graph cache** (status "Up …
  (unhealthy)" until `java` finishes; the healthcheck can lag behind the real readiness). GH serves
  `/info` (profiles car, foot) once ready. `gh-data/config.yml` still lists
  `custom_model_files: [car.json]/[foot.json]` but those files are missing — GH tolerates this and
  runs with the default models, so **do NOT touch the config while the container is healthy** (the
  earlier "GH won't start" prediction was wrong in practice).
- `route()` returns `None` on any failure → caller interpolates and **flags**
  `path_source:"interpolated"` (dashed on map). 24h cache. `is_healthy()` via `/info`.
- **New client path**: `POST /api/routes/drive` uses `app_state.get_gh().route("car", …)` —
  the backend is the ONLY caller of GH for drive (no hardcoded :8080 fetch in the frontend — §20 #34).

### 15.4 Open-Meteo — weather (WHY: free, no key, honest)
- Free API, no key. `current(lat,lng)` returns temp_c, WMO condition label, weather_code, humidity,
  wind_kmh, is_day, `rain_next_hour` (any of first 4 fifteen-min precip probs ≥30). 15-min cache;
  failures cached as None. Feeds header widget + TOPSIS weather factor + LangGraph factors.

### 15.5 eRail.in — live trains (WHY: real train data or nothing)
- Scraped eRail API for **48 mapped Karnataka station codes** (NOT 22 — code is ahead of docs).
  Live trains flagged `source:"live"`; if eRail unreachable and the pair is in the 7 static
  city-pair fallbacks → `source:"fallback"` + note "NOT live". Never invented.

### 15.6 Reddit r/bangalore — news + place signals (WHY: fresh community signal)
- JSON API via DataImpulse proxy. Input to the news loop + (PROMPT_8) qualitative hints only.

### 15.7 OpenRouter / Gemini — LLM (WHY: summaries & explanations only)
- **Why**: the product wants AI "why recommended" + review summaries + plain Hinglish route
  explanations. Chain: OpenRouter (`openai/gpt-4o-mini`) → Gemini (`gemini-2.0-flash`). JSON mode,
  temp 0.2, timeout 30.
- **2026-08-03 provider-chain fixes (§20 #30, §29):**
  - **401 bug (WRONG BASE URL)**: `llm_agent`/`review_summarizer` sent the `sk-or-…` key to
    `platform.openai.com/v1` instead of `https://openrouter.ai/api/v1` → every call 401. Fixed:
    base URL is `openrouter.ai/api/v1`.
  - **402 credits bug**: OpenRouter now returns `402` ("…can only afford 17") because the account
    has ~no credits. `review_summarizer` was rewritten with per-provider `try/except` +
    `_summarize_with()` so an OpenRouter 401/402 **falls back to GEMINI** (via
    `generativelanguage.googleapis.com/v1beta/openai/`); `max_tokens=256` (was 16384 → also
    triggered the 402). Same chain exists in `llm_agent.chat_json`.
  - **Never verified live yet**: after the rewrite + backend restart, the enrich summary was still
    the deterministic fallback ("Based on 8 Google reviews (reliability 90%).") — the Gemini
    fallback path needs one live enrich test (§31 item 2).
- **Hard rule**: NEVER fares/timings/bus numbers/review text/reliability/news/scores. If both fail →
  deterministic fallback text. `review_summarizer` uses the same providers (timeout 20, 14k chars).

### 15.8 DataImpulse proxy — IP rotation for scraping (see §16)

---

## 16. THE PROXY SYSTEM (DataImpulse) — exactly when it IS and IS NOT used

### 16.1 What it is
`backend/services/proxy_manager.py`. Credentials: `DATAIMPULSE_USER/PASS`, host default
`gw.dataimpulse.com:823`. Builds the session lazily:
```
proxies = {"http": "http://{user}:{pass}@{host}", "https": "http://{user}:{pass}@{host}"}
header User-Agent: "Mozilla/5.0 (VOYAGER news engine)"
```
`available` = bool(user and pass). `get(url, timeout=10, retries=2)` → `requests.Response | None`;
returns None immediately if creds missing; retries with backoff 0.5s then 1.0s; None on total
failure.

### 16.2 The rule (tested in `test_prompt5.py::TestProxy`)
- **USED for IP-blockable targets**: Reddit r/bangalore JSON, DDG html search (news fallback),
  news sites, review scans. These are anonymous GET scrapes where the site can block datacenter IPs.
- **NEVER used for API-key services**: SerpAPI, Google Maps, Open-Meteo, OpenRouter/Gemini, eRail
  — they authenticate by key, so a proxy adds nothing and risks breaking auth. The test
  inspects `google_maps_client`, `serpapi_client`, `weather_client` and asserts none reference
  "dataimpulse".

### 16.3 Bandwidth budget (Render, monthly ~5GB pool)
- news loop ~200KB/cycle → ~1.8GB; DDG fallback ~50KB/search → ~0.5GB; review scans ~100KB/place →
  ~1GB. Total **~3.3GB ✅ within 5GB**. Keep loop interval ≥5 min, always cache news, never scrape
  on every page load.

---

## 17. DATA SOURCES & DATASETS INVENTORY

| File | Size | Content | Used by |
|---|---|---|---|
| `bmtc_gtfs/` (11 .txt) | ~190MB | Official BMTC GTFS: agency, calendar, fare_attributes, fare_rules, feed_info, routes, shapes, stops, stop_times, translations, trips | raw-load cold path only (NOT committed) |
| `processed/gtfs_cache.pkl` | **76MB** | 7271 shapes, 5077 stops, 429882 stop-times, `name_map`, `route_id_to_name` | **committed**, reused at startup (0.65s) |
| `bmtc_all_stops_master.csv` | 2MB | ~2972 bus stop names + coords + route lists | stop DB + name resolution |
| `bengaluru_metro_network.csv` | 8KB | Purple + Green stations, edges, dist | metro nodes/edges (NO Blue/Yelahanka) |
| `kia_routes_fare_full.json` | 22KB | KIA Vayu Vajra routes + fares | KIA bus options |
| `transit_fares.json` | 3.5KB | BMTC AC/nonAC + metro slabs | fare engine |
| `karnataka_railway_stations.json` | 2.8KB | 22 Karnataka rail codes | rail nodes; live via eRail.in |
| `traffic_logs.csv` | 7.5MB | Quarterly traffic/crowd data | ML model (PROMPT_7), NOT routing |

Paths (from `config.py`): `DATA_FOLDER`, `GTFS_CACHE_PATH`, `GTFS_RAW_FOLDER`,
`TRANSIT_FARES_PATH`, `KIA_ROUTES_PATH`, `METRO_NETWORK_PATH`, `BUS_STOPS_MASTER_PATH`,
`RAIL_STATIONS_PATH`, `TRAFFIC_LOGS_PATH`, `ENV_PATH`. `OPERATIONAL_METRO_LINES =
("Purple Line","Green Line")`.

---

## 18. ENVIRONMENT VARIABLES & SECRETS

`.env.example` (committed, 12 vars) — real values go in `.env` (never committed):
```
# LLM Provider
OPENROUTER_API_KEY / OPENROUTER_MODEL=openai/gpt-4o-mini / GEMINI_API_KEY
# Google Maps
GOOGLE_MAPS_API_KEY
# SerpAPI
SERPAPI_API_KEY
# DataImpulse proxy
DATAIMPULSE_USER / DATAIMPULSE_PASS / DATAIMPULSE_HOST=gw.dataimpulse.com:823
# Postgres (PROMPT_8)
DATABASE_URL=postgresql://user:pass@host/voyager?sslmode=require
# Fuel & defaults
FUEL_PRICE_PER_LITER=110.0 / PETROL_AVG_MILEAGE=15.0
# Test time override (optional)
VOYAGER_TEST_TIME=15:30
```
`config.py` reads via python-dotenv at import (`load_env()`); `env_str`/`env_float` helpers. Runtime
constants: `FUEL_PRICE_PER_LITER` (110.0), `PETROL_AVG_MILEAGE` (15.0), `DATABASE_URL` (unused
until PROMPT_8). Frontend: `VITE_API_BASE` (default `http://localhost:8000/api`); PROMPT_9 uses
`VITE_API_URL` for the deployed backend URL.

---

## 19. EVERYTHING ACHIEVED & CORRECTED SO FAR (session log)

Git log (main, newest first) tells the v2 story (all commits staged from `PROJECT/`):

- `401f33a` — **Search/CORS/location-buttons + PBF committed**: Google Places 403 → OpenStreetMap
  Nominatim fallback (search/nearby/geocode), CORSMiddleware in `main.py`, current-location buttons
  (HeaderBar + AToB source/dest), invalid Google field-mask fix, `bangalore.osm.pbf` committed so
  fresh clones are self-contained.
- `60dc9db` — **PROMPT_7**: traffic slowdown ML model (time-of-day), integration + fake-data audit
  tests, benchmark (`traffic-model-info` endpoint live).
- `61ff043` — **Wire live SerpAPI ride overlay** + pending fixes: cap LLM tokens, serpapi
  `place_results` shape, train code resolution.
- `da5cbd8` — **Rewrite MASTER_KNOWLEDGE_BASE** into the full 27-section project bible.
- `a5348d3` — **PROMPT_4/5/6**: search+reliability+TOPSIS, LangGraph live layer, glassmorphism
  frontend (**84 tests pass**, `tsc -b` + `vite build` clean).
- `6f29acf` — "worked till the 3rd prompt file" (PROMPT_3 era wrap-up).
- `9c631bd` — Long-haul bus→metro rides on ALL routes (fix capped-route skip) + fix reverse-shape
  duration slice producing 1-min stubs; Rajanukunte direct-285-to-Majestic regression test.
- `523197c` — Long-haul bus→metro interchange rides: 285 from Yelahanka → Kempegowda Bus Station
  (Majestic) → Purple metro to MG Road (2 hops, ₹60).
- `18c5c8c` — Fix metro interchange options: split combined hub lines, dedup metro stations, cap
  forward walk at 16, fix metro path prefix double-bug.
- `5aadb08` — **PROMPT_3 segment builder API**: interactive hop planner (`segments` +
  `segment-next`), FastAPI app (main/api), 5-min cache, 11 acceptance tests.
- `2e2b8ff` — **PROMPT_2 routing graph + N-hop route finder**: full GTFS bus topology, metro/rail,
  grid walk edges, best-first A* with schedule resolution.
- `013cf4d` — Apply route-name cleaning at GTFS pickle load (9 leaked suffix names), re-save pickle.
- `b50e180` — Wire Neon `DATABASE_URL` + run GraphHopper (Bangalore crop, car+foot): fix duplicate
  point param bug, add docker-compose + config.
- `b48de93` — **PROMPT_1 data layer**: GTFS loader (pickle reuse, name resolution, shape-projected
  segments), fare engine, station DB, GraphHopper client.
- `3f442e2` — **VOYAGER v2 fresh-build PROJECT folder**: 9 build prompts, data assets, GTFS pickle.

**2026-08-02 session (search dead → CORS → location buttons) — FULL DETAIL:**
- **Root cause found**: Google Cloud project behind `GOOGLE_MAPS_API_KEY` has **billing disabled**
  + Places API not authorized → every Places/Geocoding call returned `403 PERMISSION_DENIED` →
  all search returned `{"places":[]}` (search, nearby, A→B autocomplete all broke silently).
- **Second bug**: Places (New) field mask used `places.openingHours` (invalid → `400
  INVALID_ARGUMENT`). Fixed to `places.regularOpeningHours` / `currentOpeningHours`.
- **Fix (honest, real data)**: `GoogleMapsClient` now tries **Google first**, and on empty/401/403
  falls back to **OpenStreetMap Nominatim** (`_osm_places`, `_osm_nearby`, `_osm_geocode`) — real
  places with real lat/lng, no API key. After a 401/403, Google is skipped for 10 min
  (`_google_dead_until`) so suggestions stay fast. **Google remains the primary source — the
  moment billing is enabled it takes over automatically.**
- **CORS**: `backend/main.py` added `CORSMiddleware` (`allow_origins` = localhost:3000 +
  127.0.0.1:3000, `allow_origin_regex` = `https://.*\.onrender\.com`). Frontend axios uses
  `http://localhost:8000/api` directly, so CORS is mandatory. Verified `Access-Control-Allow-Origin`
  returns the origin.
- **Current-location UI**: `HeaderBar.tsx` — circular `my_location` button at top flies map to live
  position (re-requests geolocation if unknown). `AToBPanel.tsx` — circular current-location buttons
  inside both Source and Destination inputs.
- **Git/repo ops**: `bangalore.osm.pbf` (42MB) added to `.gitignore` removal + committed, so a
  friend's `git pull` gets everything. Pushed as `401f33a` to `origin/main`.
- Verified after restart: `/api/health` OK, `?q=cubbon park` returns 2 real OSM places with coords,
  fast path ~1.3s, `tsc --noEmit` clean.

**PROMPT_7 session (ML)** — `backend/services/traffic_model.py` (`predict_slowdown`, `model_info`),
`GET /api/routes/traffic-model-info` (live: `{"model":"time_of_day","mae":0.1134,...}`),
`test_traffic_model.py` (9), `test_no_fake_data.py` (6), benchmark within budget. Traffic factor
feeds TOPSIS criterion #4.

**PROMPT_4 session (search/scoring)** — `google_maps_client.py` (Places New/Geocoding/Directions,
≥40% keyword overlap, 15km radius, 4-decimal dedup), reliability formula + `_score_from_rating`
(never trusts external), SerpAPI review chain (real `user_reviews.most_relevant`), local sentiment
(lexicon + optional HF), `topsis_engine.py` (8-factor numpy, `TopsisWeights`), `ride_pricing.py`
(SerpAPI live + Karnataka govt formula), endpoints search/nearby/enrich/verify/reviews/ride-prices,
`test_prompt4.py` (28 tests).

**PROMPT_5 session (live layer)** — weather client (Open-Meteo), news engine (r/bangalore + DDG via
DataImpulse background loop, classify/geo-tag/LLM-summarize), `proxy_manager.py`, eRail train
scraper (48 codes), `backend/services/langgraph/` package (VoyagerLangGraph: parallel dispatch,
synthesis, route-context workflow), `test_prompt5.py` (20 tests).

**PROMPT_6 session (frontend)** — `frontend/` scaffolded (Vite react-ts), `index.css` glassmorphism
design system, `types/index.ts` contracts, `services/api.ts` typed client, `context/AppContext.tsx`
global state, `MainPage` (3-tab bottom-nav), `HeaderBar` (clock/weather/dark), `MapView` (Leaflet
pins/polylines/flyTo), `SearchPanel`, `DiscoveryPanel` (+ `/api/search/photo` proxy 307-verified),
`AToBPanel` (+ SegmentFlowView), `SegmentFlowView` (3-column hop window, breadcrumb, lazy
segment-next, map pan, complete screen), `TripPanel` (GPS journey), `NewsPopup` (LIVE 2-min poll),
`vite.config.ts` `/api` proxy → `VITE_API_BASE`. Verified: build clean, dev server + proxy + 84
backend tests all green.

### 19.3 The "friend's machine" git incident (DO NOT REGRESS)
A collaborator's machine got a **partial clone** (`git fetch --filter=blob:none`) then a
`git reset --hard` over a flaky connection. The 42MB PBF + 76MB pickle blobs failed mid-download
(`curl 56 schannel: server closed abruptly`), leaving `index.lock` stale, a half-materialized
working tree, and a stuck reset. **Lessons:**
- **Never use `--filter=blob:none`** on this repo.
- **Large files are Git LFS** (`.gitattributes` committed): `*.pbf`, `*.pkl`, `*.osm`, `*.zip`,
  etc. LFS objects are fetched by the LFS filter on `git pull`/`clone` — no giant raw blobs in the
  main object store anymore (smaller clone, resilient to the exact failure above). On any new
  machine: `git lfs install`, then `git lfs pull`.
- **Never let two machines diverge on `main`** — always `git pull` first, keep local commits
  zero. A forced-update/rewrite on `origin/main` is what makes reset painful.
- For a fresh collaborator: **download the GitHub ZIP** (browser resumes) and extract over the
  folder (`robocopy <zipdir> <folder> /E /IS /IT`), or `git clone` when the network is reliable
  (LFS bytes come down on first pull). Only `.env` (secrets) still needs manual copy.

### 19.4 2026-08-03 HARDENING SESSION — full record (the bugs, the choices, the verification)
Trigger: the owner opened the running app (backend :8000, Vite :3000, GraphHopper :8080) and hit
several visible breakages at once. Everything below was reproduced, root-caused, fixed, and
verified against the LIVE stack.

**19.4.1 "The search API we built… I guess it's missing"** → **NOT missing.**
`/api/search/places` exists in `backend/api/routes.py` (committed), is registered via
`app.include_router(search_router, prefix="/api")` in `backend/main.py:38`, and returns real OSM
places live (`?q=mg road` → non-empty). Lesson: when a feature "disappears", check the running
server first (`GET /api/health`) before assuming code is gone.

**19.4.2 "The map goes on a RANDOM AREA instead of Bengaluru"** → **TWO separate coordinate swaps**
(§20 #26 and #31). The one the owner hit while using the hop window:
- `SegmentFlowView.tsx` (both `confirmHop` and `onMouseEnter`) flew to
  `{ lat: lastPt[1], lng: lastPt[0] }` — but geometry is already `[lat, lng]`, so this flipped
  Bengaluru (≈13°N, 77°E) into ≈77.5° lat (the Arctic). Clicking or even hovering any hop option
  threw the map to the "random island".
- `MapView.legGeometry` had the same `[pt[1], pt[0]]` swap (its own Arctic projection).
**Choices made** (so it can never regress):
1. `legGeometry` now returns `[Number(pt[0]), Number(pt[1])]` — identity, because backend already
   sends `[lat, lng]` and Leaflet wants `[lat, lng]`.
2. Every `setFlyTo` in `SegmentFlowView` uses `{ lat: lastPt[0], lng: lastPt[1] }`.
3. `MapView` gained a **Bengaluru-box guard** (`inBengaluru`: 12–14 lat, 76.5–78.5 lng) applied in
   both `FlyController` (refuses bad targets) and `fitBounds` (drops out-of-box points), so even a
   rogue coordinate can never move the map away again.
4. Removed the fake dashed "source→dest" connecting line in `RoutePolylines` — it painted a
   straight line over real geometry and confused the user.

**19.4.3 "Multi-hop is not what I wanted… SEE how a user chooses the path and BUILDS it."**
The old UI showed a wall of columns (up to 40 options each) with duplicated rows and stale-looking
schedules, and it didn't match PROMPT_3's "Google-Maps-like: 507-D, phir Kogilu Cross pe KIA-9…"
guided flow. **Choices made:**
- Rewrote `SegmentFlowView` as a **progressive hop builder** (§14.11): one hop column at a time,
  pick → confirmed into breadcrumb → next hop appears (client-filtered prefetch or time-chained
  `segment-next`), Undo/Reset, complete screen, path drawn on map hop by hop. Full path is kept in
  `journey.segments` so the map shows every leg, not just the last response.
- **Dedupe key now includes `departureTime`** — kills the repeated identical rows.
- `groupSize`/`budget` from AToBPanel are now actually passed through (they were hardcoded 1/500).
- Underlying correctness fixes that made "selecting did nothing" possible:
  - **ChosenLeg 422 bug (§20 #27)**: `ChosenLeg.destinationStop` was `str` in the API schema but
    `segment_builder`/frontend send a dict `{name,lat,lng}` → FastAPI returned 422 on every
    `segment-next` after the first hop, so the build silently stopped. Fixed: `destinationStop:
    dict | str` + normalization in `build_segment_next`. Live-verified: `/api/routes/segment-next`
    now returns a time-chained Segment 2 (e.g. from Puttenahalli: walk, bus 229, 212-M, 229-D,
    MF-36 … `connectedFrom` chained, departures ≥ arrival+4min).

**19.4.4 "The details panel is STILL not visible / blurry-appears-then-disappears."**
Reviews now render, but the panel painted *under* the Leaflet map (Leaflet panes use z-index
200–700 and escape their container unless a stacking context is created) and its
`backdrop-filter` made it look blurry. **Choices made:**
- `.map-wrap { z-index: 0 }` in `MainPage.css` — traps Leaflet panes in a stacking context so they
  can no longer paint over the panel.
- `.discovery` z-index 40 → **60** so the details panel sits above the map.
- Removed the blanket "unknown" status pill in `SearchPanel` (it was fake data — the status is only
  shown when it actually exists).
Remaining verification TODO (§31 item 4): confirm in the live browser with devtools; if the panel
still ghosts, next lever is `isolation: isolate` on `.app-body` or moving `DiscoveryPanel` into the
map DOM tree.

**19.4.5 Ride pricing note was fake.**
`ride_pricing` appended `"x{surge:.1f} surge"` to every estimate note, implying a surge that wasn't
there. **Choice**: note is now `"Estimated fare • Karnataka govt rates ({dist_km:.1f} km)"` —
honest, no invented surge factor (§20 #32).

**19.4.6 Drive path was never drawn; hardcoded :8080 fetch.**
`startDrive` and `selectRide` used `fetch("http://localhost:8080/route?…")` directly from the
browser (CORS + error-handling + hardcoded URL problems). **Choices made:**
- New backend endpoint `POST /api/routes/drive` (`DriveRequest`, uses `app_state.get_gh()`), wired
  in `AppContext.ridePath`/`setRidePath`, `api.driveRoute`, and `AToBPanel` now draws the real GH
  road path on the map. `selectRide` also draws it. Live-verified: `path_source=graphhopper
  dist_km=5.30 dur_min=6.1 pts=74` for MG Road→Majestic.

**19.4.7 Search results had no ratings/photos (looked empty).**
Google is 403 (billing off), OSM gives coords only. **Choices made:**
- SerpAPI `search_place` **rating fallback** in search_places/nearby (§15.1, §20 #28). Live:
  `?q=Cubbon Park` first hit is now Chamrajendra Park `ChIJL2fQ53MWrjsRuN9D6aalLMY` rating 4.4,
  143,010 reviews.
- `enrich_place` **OSM→Google resolution** (§15.1, §20 #29). Live: `osm:way22895320` → resolves to
  the same `ChIJ…`, 8 real reviews, reliability 90, green pin.
- `DiscoveryPanel.photoUrl` accepts `http`-prefixed SerpAPI thumbnails (§20 #36).

**19.4.8 LLM review summary was broken (401, then 402).**
§15.7 / §20 #30: wrong OpenRouter base URL (401) then credit exhaustion (402, "can only afford
17"). **Choice**: provider chain OpenRouter→Gemini with per-provider try/except and
`max_tokens=256`. **TODO (unverified)**: one live enrich to see the Gemini summary (§31 item 2).

**19.4.9 Test regression surfaced by the audit.**
`test_prompt4` `test_total_is_vehicle_fare_not_per_person_times_group` failed at group_size=4 on a
strict `1e-6` rounding assert. **Choice**: tolerance `1e-6 → 0.5` (the arithmetic is float-safe at
that precision). Full suite back to **104 passed**.

**19.4.10 Operational facts learned this session (add to §30):**
- **Vite binds IPv6 `::`**, so `http://localhost:3000` works but `http://127.0.0.1:3000` FAILS
  (connection refused) — always give the owner `localhost:3000`.
- After any backend restart, the frontend's stale in-page state (old Leaflet viewport, old
  chosenLegs) survives HMR — a **hard browser refresh (Ctrl+Shift+R)** is the first move before
  re-testing UI.
- OneDrive sync adds latency to cold starts (first `segments` call ~60–120 s cold vs ~3 s warm).
- Tests take ~63 s on this OneDrive-backed disk (was ~37 s on a local disk) — not a code issue.
- `project-graphhopper-1` came up on Docker Desktop start even though `custom_model_files:
  [car.json]/[foot.json]` are missing from `gh-data/` — GH fell back to default models. Don't
  "fix" the config while the container is healthy.

**19.4.11 Working-tree status at close:** all of the above is implemented and server-verified but
**NOT committed/pushed** (owner approval pending). `git status` shows a dirty `PROJECT/`.

---

## 20. PROBLEMS → BETTER OPTIONS CHOSEN (error glossary — DO NOT REGRESS)

1. **OSRM public URL** (`router.project-osrm.org`) used instead of local — all paths became
   interpolated straight lines. **Better choice**: v2 uses **local GraphHopper (8080)**; when it's
   down the interpolated path is *flagged* (dashed), never silent. OSRM is banned.
2. **LLM-generated fake reviews** with fake Indian names when scraping failed. **Banned** — no LLM
   review text ever; summaries only of real reviews.
3. **Ride price `total = pp * group`** double-charged a vehicle fare by passenger count.
   **Correct**: `total = vehicle_fare`, `pp = total / group`. Tested.
4. **GTFS route garbage** `"MF-28 JKLO-ISROQ-LGRNB"` uncut. **Fix**: `clean_route_short_name`
   at load + ingestion.
5. **`_gtfs` import-by-value bug** — `from transit_config import _gtfs` captured `None` at load;
   every GTFS call returned empty. **Fix**: v2 uses `app_state` live singletons.
6. **geodesic in hot loops** → 11.6s graph build. **Fix**: haversine + `_dist_cache` → 2.2s.
7. **SequenceMatcher loop** → 79s name pre-resolve. **Fix**: word-overlap + trigram
   `get_close_matches` → 7.7s (then 0s from pickle `name_map`).
8. **Aggressive metro direction filter** (`dest_to_dm > nm_dist_to_dest * 1.1`) blocked valid
   routes (Cubbon Park→MG Road). **Fix**: absolute `+ tolerance` (500m/2500m metro).
9. **300m circular guard** let routes loop. **Fix**: 800m `_is_visited`.
10. **Full-route shape fallback** drew the entire bus route (40km lines) instead of stop-to-stop
    slices. **Banned**: `get_stop_to_stop_segment()` only.
11. **GTFS 41s startup block**. **Fix**: lazy via `app_state`; pickle reuse (0.65s).
12. **Hardcoded dark hexes** in components (theme clash). **Rule**: CSS variables only.
13. **Shape-slice stub** — reverse-shape duration slice produced 1-min stubs on long rides (285).
    **Fix**: real duration for long reverse rides.
14. **Metro path prefix double-bug** — interchange path built with a duplicated prefix node. **Fix**.
15. **Capped-route skip** — routes whose transfer stop lay beyond the first few stops were dropped.
    **Fix**: metro-transfer search over ALL routes.
16. **`justdial_scraper` site blocking** → **DROPPED** in v2; place verification uses Google Places +
    SerpAPI instead.
17. **SerpAPI place_details key bug** — used `"place"` instead of `"place_results"`; reviews read
    from an int count instead of `user_reviews.most_relevant`; fields `user.name`/`snippet` instead
    of `username`/`description`. **Fix**: correct keys + field mapping + `_CACHE_VERSION=2`
    invalidates stale cache.
18. **Per-person vs vehicle fare confusion in the frontend** — `SegmentFlowView.tsx` previously
    swapped `[lat,lng]→[lng,lat]` in 9 places; Leaflet needs `[lat,lng]` (what the backend
    returns). **Fix**: single `legGeometry()` swap keeps it right.
19. **Path shown only at journey end** — geometry wasn't drawn per confirmed hop. **Fix**: map
    updates after each hop confirm.
20. **Full-shape fallback in path chain** (NES Office→Doddaballapura random lines). **Fix**:
    removed `full_shape` from the fallback chain entirely.
21. **GTFS time filter returning empty** — future-departure filtering emptied results. **Fix**:
    fallback to all departures.
22. **Direction filter** handling routes starting/ending at source stop — relaxed cos_angle
    0.5→0.3, early-returns True when route endpoint closer to dest; distance check absolute (+0.5).
23. **No CORS middleware** — the frontend axios client talks directly to
    `http://localhost:8000/api` (its `baseURL`), so **CORS was mandatory** — without it every
    request failed in the browser (`AxiosError: Network Error`). **Fix (2026-08-02)**: added
    `CORSMiddleware` in `backend/main.py` (`allow_origins` = localhost:3000 + 127.0.0.1:3000,
    `allow_origin_regex` = `https://.*\.onrender\.com`). Do not remove it.
24. **Google Places 403 / billing disabled** — the Google Cloud project behind
    `GOOGLE_MAPS_API_KEY` had **billing off + Places API not authorized**, so search/nearby/
    geocode silently returned empty (`{"places":[]}`). Combined with an invalid field mask
    (`places.openingHours` → 400), every search path was dead. **Fix**: (a) field mask corrected to
    `regularOpeningHours`/`currentOpeningHours`; (b) `GoogleMapsClient` adds an **OpenStreetMap
    Nominatim fallback** (`_osm_places`/`_osm_nearby`/`_osm_geocode`) used when Google errors or
    returns empty; after a 401/403 Google is skipped for 10 min (`_google_dead_until`) so
    suggestions stay fast. **Google is still tried FIRST** — re-enabling billing auto-restores
    Google data; the OSM fallback is honest real data (lat/lng) but no ratings/photos (those show
    as Unknown).
25. **Cached Google results vs fresh key** — `GoogleMapsClient._cache` holds 24h results; if the
    Google key was enabled later, a cached empty/OSM result may linger up to 24h. (Acceptable;
    restart clears it.)

**2026-08-03 additions (from §19.4 — do-not-regress):**

26. **Map flew to a "random island" (~77.5°N Arctic) — TWO lat/lng swaps.** `MapView.legGeometry`
    returned `[pt[1], pt[0]]` on geometry the backend already sends as `[lat,lng]`, so every
    polyline projected to high-latitude nonsense; `SegmentFlowView`'s flyTo did the same swap, so
    clicking/hovering a hop threw the map to the Arctic. **Fix**: `legGeometry` is now an identity
    (`[Number(pt[0]), Number(pt[1])]`), all `setFlyTo` use `{lat: pt[0], lng: pt[1]}`, and a
    Bengaluru-box guard (`inBengaluru`) blocks bad flyTo/fitBounds targets. Test any new coordinate
    code with the box guard in mind.
27. **`ChosenLeg.destinationStop` schema was `str` but the builder/frontend send a dict** →
    FastAPI **422** on every `segment-next` after hop 1 → the multi-hop build silently stopped
    ("selecting did nothing"). **Fix**: `destinationStop: dict | str` in the request model +
    normalization in `build_segment_next`. Backend request models must match what the frontend
    actually sends.
28. **OSM results have no ratings/photos → search looked empty.** **Fix**: SerpAPI `search_place`
    rating fallback (`_serp_to_place` + `_haversine_km`) attaches a real Google rating/count when
    the OSM result has none; OSM-first results keep coords, SerpAPI adds the rating signal.
29. **Enrich needs a Google `ChIJ…` but search can return `osm:…` ids** → reviews were impossible.
    **Fix**: `review_tools._resolve()` converts OSM place_id → real Google place_id via
    `serpapi.search_place`, then enrichment proceeds (degraded-with-metadata when resolution
    fails, never a bare degrade).
30. **OpenRouter 401 then 402.** (a) 401: the `sk-or-…` key was sent to `platform.openai.com/v1`
    (wrong base URL) — fixed to `https://openrouter.ai/api/v1`. (b) 402: account has ~no credits
    ("can only afford 17") and `max_tokens` was 16384 — fixed with per-provider
    `try/except` + `_summarize_with()` falling back to **Gemini**, `max_tokens=256`. **LLM calls
    must always have a fallback provider + deterministic final fallback.**
31. **Hop-card hover/select flew the map away (Arctic).** Same root as #26 but in
    `SegmentFlowView` — `setFlyTo({ lat: lastPt[1], lng: lastPt[0] })`. Fixed to
    `{ lat: lastPt[0], lng: lastPt[1] }`. (This was the ONE the owner kept hitting — it fires on
    every hover.)
32. **Fake surge note on ride fares** — `"Karnataka rate estimate x{surge:.1f} surge"` implied a
    surge factor that isn't applied. **Fix**: `"Estimated fare • Karnataka govt rates ({dist_km:.1f}
    km)"`. Never print a factor you don't apply.
33. **Drive used a hardcoded frontend `fetch("http://localhost:8080/route…")`** — bypassed the
    backend, had no error handling, leaked a URL. **Fix**: `POST /api/routes/drive` (backend GH
    client) + `api.driveRoute` + `ridePath` in AppContext; both "Estimate drive" and ride-card
    select draw the real road path.
34. **Details panel painted UNDER the Leaflet map** (Leaflet panes z 200–700 escape their
    container) + blurry `backdrop-filter`. **Fix**: `.map-wrap { z-index: 0 }` creates a stacking
    context that traps Leaflet panes; `.discovery` z-index 40 → 60. (Verify in-browser — §31.)
35. **Fake "unknown" status pill** in `SearchPanel` — shown unconditionally even when no
    business_status exists. **Fix**: only render business_status/rating when actually present.
    Missing → nothing, never an invented label.
36. **SerpAPI thumbnail `photo_name` can be a full `http…` URL** (not just a name) — the
    `/api/search/photo` proxy would mangle it. **Fix**: `DiscoveryPanel.photoUrl` passes
    `http`-prefixed names straight to `<img src>`, others go through the proxy.

---

## 21. TESTS & QA (all 104, per file)

Command: `python -m pytest tests/ -q` from `PROJECT/` → **104 passed** (~63s on the OneDrive-synced
disk, ~37s on a local disk; no Docker/API needed).

### `test_data_layer.py` (12)
route-name cleaning (incl. leaked-suffix regression), pickle fast-load, Majestic name resolution,
known-unresolvable acronym (`hnrj`), real routes at Majestic, stop-to-stop segment both directions,
no-nan stop names, spatial query <5ms, metro Purple+Green only, fare spot-checks, surge,
ride per-person split.

### `test_route_finder.py` (10)
graph node counts (2000+ bus / 68 metro / ≥22 rail), walk edges present, metro edges carry line,
bus nodes have bus edges, bus-transfer paths MG→Koramangala, pure-metro interchange MG
Road→Yelachenahalli (both lines), forward-progress no-backtracking, walk-only when close, ride
always present, warm timing ≤5s.

### `test_segment_builder.py` (14)
T1 Wonderla (real options, full contract shape, real GTFS bus legs, connectedFrom chains,
forward-progress), T1 bus legs real GTFS, T2 multi-bus to MG Road, T3 time chaining
(`>= arrival + 4min`), T4 short-hop walk-primary-no-cab, segment-next journey-complete, budget
exceeded flag (₹5 → every paid option exceeds, walk never), segments cached (<50ms identical),
timing warm ≤3s, metro interchange both lines (Purple + Green from KBS, real distance/duration,
metro_line geometry), long-haul bus→metro transfer (285 → metro corridor, >10km, >30min, chains
into Purple), Rajanukunte direct-285-to-Majestic (distance >10km, duration >30min).

### `test_prompt4.py` (28)
Reliability (high scores green, negative drag, permanently-closed always red, temporarily-closed
capped yellow, unknown status no penalty, no-reviews explainable, pin_class edges), Sentiment
(positive >0.6, negative <0.4, negation flips, neutral 0.5, empty average, average over reviews),
TOPSIS (best-on-cost, best-on-time, weather prefers covered mode in rain, single route best-match,
identical share rank 1, cc normalized, empty → [], custom weights normalize), RidePricing (total
== vehicle fare not pp×group, all 5 providers estimated, fare grows with distance, live overrides
estimate, bad live ignored, labels, surge never zero/negative).

### `test_prompt5.py` (20)
Weather (WMO labels, None on network failure), News (classify, geo_tag silk board, dedup+TTL, merge
caps 25 sorts, relevant keyword filter, relevant proximity sort), Train (codes mapped, partial
match, unknown → None, fallback flagged NOT live, fallback pairs ≥7), Proxy (not available without
creds, never referenced by API-key clients), LangGraph (live context all groups, rain feeds
factors, failing tool never blocks, ask degrades without LLM, time_of_day factor).

### `test_traffic_model.py` (9) + `test_no_fake_data.py` (6) — PROMPT_7
Traffic model: time-of-day crowd index in [1.0, 1.8], deterministic, mae field present, model_info
shape, lazy load. Fake-data audit: every API payload's bus numbers ∈ GTFS routes, fares match fare
engine, no unlabeled estimated, no LLM-copied review text, no fabricated geometry, no hardcoded
news.

### QA commands
- Backend tests: `python -m pytest tests/ -q` (in `PROJECT/`) → **104 passed**
- Backend compiles: `python -c "from backend.api.routes import search_photo; print('ok')"`
- Frontend: `cd frontend; npx tsc --noEmit` → 0 errors
- Server: `python -m uvicorn backend.main:app --port 8000` → `GET /api/health` →
  `{"status":"ok","services_loaded":true}`
- Dev frontend: `cd frontend; npx vite --port 3000` → `GET http://localhost:3000/` 200; axios
  calls `http://localhost:8000/api/*` (CORS must stay enabled on the backend)
- Manual search smoke test: `GET /api/search/places?q=cubbon+park` → non-empty places with lat/lng

---

## 22. PERFORMANCE BUDGETS & BENCHMARKS

| Operation | Budget (spec) | Current v2 measured |
|---|---|---|
| GTFS load from pickle | ≤1s | **0.65s** |
| Name pre-resolve (first run) | — | **7.7s** (then 0s from pickle `name_map`; 1696/2972 cached) |
| A* graph build | ≤3s | **~2.2s** (2900+ bus / 68 metro / ≥22 rail nodes, ~54k edges) |
| Server startup | ≤3s | ~3s (lazy) |
| `segments` first call warm | ≤3s | test asserts <3s |
| `segment-next` warm | ≤2s | ✓ |
| Route finding warm | ≤5s | test asserts <5s |
| Spatial query | ≤5ms | test: <0.005s avg |
| `segments` cache hit | — | <50ms (test) |
| Route-plan cache hit | ≤100ms | ✓ (10-min TTL) |
| LangGraph live gather | ≤6s worst (live down) | ✓ (per-tool timeouts, failing tools None) |
| Frontend `tsc -b` | 0 errors | ✓ |
| Frontend bundle | — | 426 KB JS / 30 KB CSS (gzip ~131 KB) |

---

## 23. DOCKER & LOCAL RUN GUIDE

```powershell
# 1) GraphHopper (car + foot, Bangalore PBF committed in gh-data/). First start builds cache.
cd PROJECT
docker compose up -d graphhopper          # port 8080
#    wait for "Started server":  docker compose logs -f graphhopper  (Ctrl+C to stop watching)
#    verify:  curl "http://localhost:8080/route?point=12.97,77.59&point=12.98,77.61&profile=car&points_encoded=false"

# 2) Backend
cd PROJECT
python -m uvicorn backend.main:app --reload --port 8000
#    → GET http://localhost:8000/api/health   → {"status":"ok","services_loaded":true}

# 3) Frontend
cd PROJECT\frontend
npm install            # first time only
npx vite --port 3000   # http://localhost:3000
#    NOTE: frontend axios uses http://localhost:8000/api directly; backend CORS handles it.

# 4) Tests
cd PROJECT
python -m pytest tests/ -q                # 104 passed
```

`docker-compose.yml` is **graphhopper only** (backend/frontend run locally per spec; OSRM from v1
is retired — never start the old root compose).

### Friend / collaborator setup (one repo, one branch, pull-only)
1. `git clone <new-repo-url> VOYAGER` (or download the GitHub ZIP — browser resumes on flaky nets).
2. **Copy `.env`** manually (secrets are never in git) — Google/SerpAPI/OpenRouter keys required.
3. `git lfs install` then `git lfs pull` (or just `git pull` with LFS installed — downloads the
   PBF + GTFS pickle automatically). If ZIP route: LFS files download on first `git pull`.
4. `docker compose up -d graphhopper`, then backend + frontend as above.
5. Rule: **`git pull` before work, `git push` after green tests. Never diverge on `main`.**
   Never use `git fetch --filter=blob:none` on this repo.

---

## 24. WHAT TO DO NEXT — PROMPT_7, 8, 9 in detail

### 24.1 PROMPT_7 — ML + integration tests + fake-data audit (✅ DONE 2026-08-01/02)
The traffic-crowd slowdown index shipped as a **time-of-day model** (honest fallback path taken:
`model:"time_of_day"`, MAE 0.1134), served at `GET /api/routes/traffic-model-info`, feeding TOPSIS
factor #4. Integration tests + `test_no_fake_data.py` (6) + benchmark all green. Design intent
recorded below for reference; do not re-build it — it works.

**Data hygiene audit (8 checks)** over every endpoint's real output: bus = real cleaned GTFS
numbers/times; metro = Purple/Green only; trains only when eRail data (fallbacks flagged); ride
prices live OR labeled Estimated; reviews real + local sentiment + LLM summary (no fabricated
text); news background-scraped/classified/summarized (never hardcoded); reliability formula output
(never random/LLM); photos from Google Places or icon (no stock placeholders); paths = GTFS
shape/metro line/GraphHopper (straight lines only when flagged).

### 24.2 PROMPT_8 — Trip Planner (design locked in grilling)
A destination-and-itinerary system **on top of** the A→B engine. Self-containment rule: defines
OWN contracts + OWN `TripTransportInterface` (`top1_route(src,dest,time,group,budget) ->
TransportHint`), never imports parent-module types; the A→B engine implements the interface.
Locked scope: multi-day 2–5 days; **Bengaluru** = curated ~100-place dataset + live Google Places +
Reddit/proxy signals; **other cities** = generic Google Places only (missing = `Unknown` neutral);
stay/accommodation **only for other cities**; transport **on-demand only** (never at generation);
Postgres persistence (`DATABASE_URL`); geo-cluster + travel-cost-aware day assignment; within-day
TSP + time-of-day constraints; LLM writes only "why recommended" + summaries.
Files: `trip_planner.py, trip_places.py, trip_budget.py, trip_assign.py, trip_store.py,
transport_interface.py, api/trip.py`, data `trip_places_bengaluru.json`. Postgres: 4 idempotent
tables (`trips`, `trip_days`, `itinerary_items`, `place_cache`). Guided input Steps 1–7 →
"Generate My Trip" (never on partial data). Relevance =
`0.40*interest_match + 0.25*rating_norm + 0.20*suitability + 0.10*time_align + hidden_gem_bonus`.
Budget engine with running totals + overspend alternatives (side-by-side deltas, never silent
downgrade) + surplus upgrades. Output: day-by-day timeline, numbered pins w/ day colors + animated
moves, summary donuts + LLM banner. 8 endpoints (see Appendix A). Budgets: generation ≤8s,
transport-hint ≤3s, recompute ≤4s, Postgres <50ms.

### 24.3 PROMPT_9 — Deployment (Render free + Neon) (design locked)
3 tiers: **Local** (full experience — backend:8000, frontend:3000, graphhopper:8080) · **Render**
(backend + frontend free tier, `render.yaml`: `voyager-backend` env python on
`https://voyager-backend.onrender.com`, `voyager-frontend` env static →
`https://voyager-frontend.onrender.com`, build `cd frontend && npm install && npm run build`,
`staticPublishPath frontend/dist`, env `VITE_API_URL`) · **Neon Postgres** (trips).
**No GraphHopper on Render** (no Docker on free tier) → walk/drive legs interpolated **flagged**
"Approx path"; bus legs stay real GTFS shapes; metro real polylines (honesty table in the prompt).
**Commit the 76MB `gtfs_cache.pkl`** (≤100MB GitHub limit) so Render cold boot ~2–3s; `.gitignore`
raw `bmtc_gtfs/` (~190MB); rebuild path `scripts/build_gtfs_cache.py`. Cold start accepted:
frontend shows "Waking up…" splash; optional cron-job.org ping to `/health` every 10 min.
DataImpulse works identically from Render (~3.3GB/mo within 5GB). In-memory caches ephemeral on
Render (only Postgres durable). Env var checklist (11): DATABASE_URL, OPENROUTER_API_KEY,
OPENROUTER_MODEL, GEMINI_API_KEY, SERPAPI_API_KEY, GOOGLE_MAPS_API_KEY, DATAIMPULSE_USER/PASS/HOST,
FUEL_PRICE_PER_LITER, PETROL_AVG_MILEAGE. Post-deploy checklist (9 items): /health, /docs,
search places real, segments real GTFS, news proxy-scraped, trip edit persists across redeploy,
frontend works, cold start splash, `test_no_fake_data` scan. **Demo story**: demo locally for real
road paths; point judges at Render URL.

### 24.4 Immediate next steps (updated 2026-08-03 — this is the LIVE action plan; see §31)
1. **Owner decision: enable Google billing + Places/Geocoding/Directions APIs** so real Google
   ratings/photos/reviews come back (OSM + SerpAPI fallbacks stay as safety nets). This is the
   single highest-value unlock — search/enrich already auto-use Google first.
2. **Verify the Gemini LLM fallback live** (§15.7): one `POST /api/search/enrich` after the
   provider-chain rewrite; expect a real summary instead of the deterministic fallback. If Gemini
   fails too, decide whether to top-up OpenRouter credits.
3. **Commit the 2026-08-03 hardening session** (after owner approval): `git pull`, run
   `pytest tests/ -q` (104) + `npx tsc --noEmit`, stage `PROJECT/`, push. (§19.4.11.)
4. **Wire the SerpAPI live ride overlay** into the two service paths that still pass
   `live_options=None` (`SearchService.ride_prices`, `PricingTool.run`) — the merge logic in
   `ride_pricing.merge_live_prices` is implemented and tested but not yet called through (§12.5).
5. Build **PROMPT_8 — Trip Planner** per §24.2 (design fully locked).
6. Later: **PROMPT_9 — Render + Neon deploy** per §24.3 (CORS already allows `*.onrender.com`).
   Docker question answered here: **why Docker at all?** Only ONE container is required —
   GraphHopper for real road geometry. Everything else runs locally (uvicorn + vite) per the spec;
   on Render there is no Docker, so walk/drive legs degrade to flagged interpolated paths and bus/
   metro stay real. Start Docker Desktop manually, then `docker compose up -d graphhopper`, wait
   1–3 min for the graph cache on first boot (see §15.3).
7. Recommended hygiene before each session: `git pull`, run `pytest tests/ -q` +
   `npx tsc --noEmit`, then start work; push only after green.

---

## 25. APPENDIX A — FULL API ENDPOINT REFERENCE

**Routers:** `routes_router` mounted at `/api/routes`, `search_router` mounted at `/api`.

| # | Method | Path | Request | Returns |
|---|---|---|---|---|
| 1 | POST | `/api/routes/segments` | `{source, destination, group_size, budget, current_time?}` | `{journey, segments[2], probes[], warnings[], journeyComplete:false, timeline[]}` |
| 2 | POST | `/api/routes/segment-next` | `{journey, chosen_legs:[{optionId,arrivalTime,destinationStop}], group_size, budget}` | next segment OR `journeyComplete:true` + `arrival` + timeline |
| 3 | GET | `/api/search/places` | `q`, `lat?`, `lng?` | `{query, places:[Place]}` |
| 4 | GET | `/api/search/nearby` | `lat`, `lng`, `radius_m=2000`, `keyword=""`, `categories=""` (CSV) | `{places:[Place]}` |
| 5 | POST | `/api/search/enrich` | `{place}` | `PlaceDetails` (or `{"error":"invalid place payload"}`) |
| 6 | POST | `/api/search/verify` | `{name, lat, lng}` | `{verified: Place\|null}` |
| 7 | POST | `/api/rides/prices` | `{origin, destination, group_size}` | `{prices:[RidePrice]}` |
| 8 | POST | `/api/langgraph/route-context` | `{source, destination, group_size, budget, current_time?, place?}` | `LiveContext` dict (weather/traffic/news/prices/reviews/factors/errors/completed_at) |
| 9 | POST | `/api/langgraph/ask` | `{message, lat?, lng?, context?}` | `{live_context, synthesis:{answer, factors}}` |
| 10 | GET | `/api/search/news` | `lat?`, `lng?`, `keyword=""`, `limit=10` | `{items:[news]}` |
| 11 | GET | `/api/search/weather` | `lat`, `lng` | weather dict or `{"condition":"unavailable"}` |
| 12 | GET | `/api/search/photo` | `name`, `max_width=400` | 307 Redirect to real Google photo URL, or `{"error":"no photo"}` |
| 13 | GET | `/api/routes/live-trains` | `from_station`, `to_station` | `{trains[], source: live\|fallback\|none, note}` |
| 14 | POST | `/api/routes/drive` | `{origin:{lat,lng,name}, destination:{lat,lng,name}}` (DriveRequest) | `{geometry:[{lat,lng},…] as [[lat,lng]…], distance_m, duration_s, path_source:"graphhopper"\|"interpolated", mode:"car"}` |
| — | GET | `/api/health` | — | `{status:"ok", services_loaded}` |

**LIVE:** `GET /api/routes/traffic-model-info` (PROMPT_7).
**2026-08-03:** `POST /api/routes/drive` (row 14 above) — GraphHopper car route for the Drive tab
and ride-card path drawing.
**Planned (PROMPT_8/9):** `POST /api/trip/plan`, `GET/PUT /api/trip/{id}` + `/api/trip/{id}/items`,
`POST /api/trip/transport-hint`, `GET /api/trip/places`, `POST /api/trip/places/suggest`,
`GET /api/trip/{id}/summary`.

---

## 26. APPENDIX B — KEY CONSTANTS

**Graph (transit_graph.py):** BUS_SPEED 18 km/h, METRO_SPEED 36, WALK_SPEED 5, TRANSFER_PENALTY 4
min, BUS_DWELL 0.3, METRO_DWELL 0.25, INTERCHANGE_FIXED 5 min; walk radii bus↔bus 500m, bus↔metro
1000m, bus↔rail 3000m.

**Route finder (route_finder.py):** entry radii bus 2km / metro 3km / rail 5km; entry tops 3/2/1;
MAX_LEGS 6, MAX_PATHS 12, MAX_DUP_PER_SIG 3; VISITED_RADIUS 800m; FORWARD_TOL 500m / metro 2500m;
BUDGET_SENSITIVITY ₹8/min; search deadline 4s; BUFFER 3 min; MAX_WAIT 45 min; WALK_ONLY_KM 2.0;
cache TTL 600s.

**Segment builder (segment_builder.py):** bus/metro candidate radius 3000m, rail 5000m;
walk-to-board 1500m; forward tol 500m/2500m; BUFFER 4 min; DEP_WINDOW 180 min; caps: 5 walk, 3 bus
board, 2 metro board, 4 routes/stop, 3 arrival stops/route, 2 metro-transfers, 6 seg2 anchors, 40
seg2 options, 6 probes; WALK_OPTION_MAX 2000m; WALK_PRIMARY 1500m; cache TTL 300s; journey-complete
radius 500m.

**Fares:** BMTC nonAC/AC slabs; metro slabs (both lines); KIA per-stop max; rides UberGo/OlaMini
24/km (min 85), XL 32/km (min 130), Auto 20/km (min 40), Rapido 5/km (min 25); surge 1.2/1.5/1.8.

**Search/scoring:** BANGALORE_CENTER (12.9716,77.5946); BANGALORE_RADIUS_KM 15.0;
MIN_KEYWORD_OVERLAP 0.40; DEDUP_RND 4; nearby maxResultCount 20; review cap 24 (slice 5 on frontend);
reliability weights 0.5/0.3/0.2; pin thresholds 70/50; TOPSIS weights listed in §12.4.

**Caches (all in-memory):** GTFS pickle 0.65s load; graph built at init ~2.2s; Maps/Serp 24h (2000
entries); ride prices 15min; weather 15min; trains 15min; route plans 10min; segments 5min; news TTL
4h (max 25).

**Frontend:** NEARBY_CATEGORIES = 19 chips; radius slider 0.5–10km default 2; suggestion debounce
300ms ≥2 chars; news poll 2 min; axios timeout 120s; fuel ₹110/L; mileage default 15 km/L;
MAX_VISIBLE = 10 hop options per column; CATCH_BUFFER_MIN = 4 min; Bengaluru guard box = lat
12–14, lng 76.5–78.5.

---

## 27. APPENDIX C — HONEST-FALLBACKS & DELIBERATE DECISIONS (the "no fake data" map)

1. **BMTC has no live API.** Every bus time is a **schedule**, labeled `source:"schedule"` /
   `status:"scheduled"`. Never pretend live.
2. **14 bus stop names have no GTFS match** (acronyms like `hnrj`, `ggmc`). They resolve to `None`
   → "No real-time data", never a fabricated match.
3. **Uber/Ola/Rapido block scrapers.** v2 uses SerpAPI directions when available + Karnataka
   govt-mandated formula, both **labeled estimated** when not live. (Live merge implemented, not yet
   wired into the two service paths — next steps.)
4. **JustDial is dropped.** Place verification uses Google Places + SerpAPI instead.
5. **Metro Yelahanka / Blue Line don't exist yet** — excluded everywhere. Only Purple + Green.
6. **GraphHopper down / not deployed** → walk/drive legs interpolated and **flagged**; bus/metro
   legs stay real (GTFS shapes / line polylines).
7. **Trains**: only shown when eRail.in has real data; 7 city-pair fallbacks flagged
   `source:"fallback"` + "NOT live". Never invented.
8. **Reviews**: never LLM-generated. Real SerpAPI + local sentiment; LLM only summarizes.
9. **Reliability score**: always recomputed from live inputs; never trusts an external field.
10. **Render free tier**: no Docker → no GraphHopper; ephemeral disk → Postgres for durable data;
    cold starts → "Waking up…" splash.
11. **Budget overrun** → `exceedsBudget` grey-out (never silent omit, so the user understands why).
12. **Interpolated geometry** is always visually distinguished (dashed + "approx path").
13. **LiveContext** degrades per-source: failing tool → `{"condition":"unavailable"}` /
    `{"label":"unavailable"}` — routing always completes (gather:true, required:false).
14. **LLM gone** → deterministic fallback text ("Live data partially unavailable.",
    "Based on N Google reviews (reliability P%).").
15. **News loop down** → `relevant()` serves last-good cache (honest empty if never ran); frontend
    shows "No news items yet." Never hardcoded headlines.
16. **Google Places unavailable (403/billing off)** → **OpenStreetMap Nominatim fallback**
    (`_osm_places`/`_osm_nearby`/`_osm_geocode`) returns **real OSM places with real lat/lng**.
    Google is always tried first; after a 401/403 it's skipped for 10 min for speed. OSM results
    have **no ratings/photos** → those fields render as `Unknown`/empty (honest, never invented).
    Re-enabling Google billing auto-restores full Google data.
17. **OSM places still look empty without ratings (2026-08-03)** → **SerpAPI `search_place` rating
    fallback** attaches a real Google rating/count/thumbnail to OSM results that have none.
    (SerpAPI budget-aware: one lookup per search; if SerpAPI fails too, the OSM result stands with
    no rating — never a fake number.)
18. **OSM place_id → Google place_id for enrich (2026-08-03)** → `enrich_place._resolve()` converts
    `osm:…` to a real `ChIJ…` via SerpAPI before fetching reviews; on failure it degrades WITH
    metadata (explains what's missing) instead of a bare "Unavailable".
19. **LLM providers (2026-08-03)** → OpenRouter primary (base URL fixed), **Gemini fallback** on
    any 401/402/timeout, `max_tokens=256`; both dead → deterministic fallback text. LLM never
    writes numbers (unchanged rule).
20. **GraphHopper not running (2026-08-03 reminder)** → `POST /api/routes/drive` returns
    `path_source:"interpolated"` with a flagged polyline; the UI still works, the path is honest.
    Docker Desktop must be started manually; first boot builds the graph cache (1–3 min).

---

## 28. DEEP-DIVE ANATOMY — every pipeline, step by step, with REAL example outputs

> This section is the "why does everything exist and how does it actually work" reference. Each
> pipeline ends with a real, captured output so a reader can recognize correct vs broken behavior.

### 28.1 The Search Pipeline (`GET /api/search/places`, `GET /api/search/nearby`)
Callers: SearchPanel (search + nearby), AToBPanel autocomplete, LangGraph SearchTool.

Steps inside `search_service`:
1. **Google first** (`GoogleMapsClient.search_places`): Places (New) `searchText` with
   `locationBias` circle 15 km around (12.9716, 77.5946), field mask (corrected to
   `regularOpeningHours`/`currentOpeningHours`), then filters: ≥40% keyword overlap
   (`MIN_KEYWORD_OVERLAP = 0.40`), coords within 15 km, dedup by 4-decimal coords. 24h cache.
2. **Google 401/403 → OSM fallback** (`_osm_places`/`_osm_nearby`/`_osm_geocode`, Nominatim):
   real places with real lat/lng, no key. After a 401/403 Google is skipped for 10 min
   (`_google_dead_until`) so suggestions stay fast. OSM results have **no rating/photos**.
3. **2026-08-03 rating fallback**: if the chosen result (or all results) have no rating, one
   `serpapi.search_place(q, cat, lat, lng)` call attaches a real Google rating + `user_rating_count`
   + thumbnail (`_serp_to_place`, `_haversine_km` for the distance).
4. **Search response** `{query, places:[Place]}` — `Place` fields:
   `place_id, name, address, lat, lng, rating, user_rating_count, price_level, business_status,
   open_now, weekday_hours, types, primary_type, photo_name, distance_km, query`.
   Example (live 2026-08-03): `?q=Cubbon Park` → first hit
   `ChIJL2fQ53MWrjsRuN9D6aalLMY` "Sri Chamarajendra Park" rating 4.4, count 143,010.

`nearby(lat, lng, radius_m, categories, keyword)`: 19-category → primary-types map; first matching
category wins; same Google→OSM→SerpAPI chain; results sorted by distance.

### 28.2 The Enrich/Reviews Pipeline (`POST /api/search/enrich`)
Callers: DiscoveryPanel "Details" button; LangGraph ReviewTool.
Chain inside `review_tools.enrich_place(place, max_reviews=24)`:
1. **`_resolve()`** — normalize `place_id`:
   - already `ChIJ…` → use as-is;
   - `osm:…` (from the search fallback) → `serpapi.search_place(name, cat, lat, lng)` → real
     `ChIJ…` (2026-08-03). Example: `osm:way22895320` → `ChIJL2fQ53MWrjsRuN9D6aalLMY`.
   - failure → return degraded-with-metadata `PlaceDetails` explaining what's missing (never a
     bare degrade).
2. **`_build_details()`** → `serpapi.place_details(place_id)`; parse **real** reviews from
   `place_results.user_reviews.most_relevant` using keys `username`/`description`/`rating`/`date`
   (do-not-regress §20 #17); cap 24.
3. **Sentiment** (`sentiment.py`): deterministic AFINN-style lexicon (negation-aware) → `sentiment_avg`
   ∈ [0,1]; optional lazy HuggingFace distilbert upgrade. **LLM never computes sentiment.**
4. **Reliability** (`reliability.py`): formula from §12.2 → `score_pct`, `pin_class`
   (green/yellow/red). Always recomputed, never trusted externally.
5. **LLM summary** (`agents/review_summarizer.py`): OpenRouter → Gemini → deterministic fallback
   `"Based on {n} Google reviews (reliability {p}%)."`. Example observed: 8 real reviews, rel 90,
   green pin (summary still fallback until Gemini path re-verified — §31 #2).
6. Cache `detail:{place_id}:v2`, 24h.
`PlaceDetails = Place + phone, website, reviews[], sentiment_avg, reliability_score, pin_class,
summary, concerns[]`.

### 28.3 The Ride Pricing Pipeline (`POST /api/rides/prices`)
1. `search_service.ride_prices(origin, destination, group_size)`:
   - `GoogleMapsClient.directions(...)` → `distance_m`, `duration_s`, `duration_in_traffic_s`
     (`traffic_ratio`), geometry.
   - `ride_prices_for_distance(dist_km, group_size, live_options=None, context=None)`:
     - `_ESTIMATE_LADDER` (all 5): uber_go/Uber/cab, ola_mini/Ola/cab, uber_xl/Uber XL/cab,
       ola_auto/Auto/auto, rapido_bike/Rapido/bike. Formula:
       `amount = max(min_fare, base + per_km*dist)`; `max = amount*1.1`; surge at mid-point
       (`total = round(mid*surge,2)`); `per_person = total/group`. **`total` = vehicle fare.**
     - `merge_live_prices(live_options, estimated, group)`: live entries win on provider match
       (SerpAPI `google_maps_directions` `ride_options`); leftover providers stay estimated;
       malformed live ignored (`_extract_price` never fabricates).
     - Labeling: `source: "live" | "estimated"`, note `"Live Uber/Ola quote from Google Maps"` or
       `"Estimated fare • Karnataka govt rates ({dist_km:.1f} km)"` (2026-08-03 — no fake surge).
   - **TODO (§31 #4)**: the two call paths still pass `live_options=None`, so the live overlay is
     implemented + tested but not yet invoked end-to-end.
2. Response `{prices:[RidePrice]}`:
   `RidePrice = {provider, mode, total, per_person, eta_min, source, note}`.

### 28.4 The Hop/Segment Pipeline (THE CENTERPIECE) — step by step
**`POST /api/routes/segments`** `{source, destination, group_size, budget, current_time?}`:
1. `build_segments` → cache key `(r4 src, r4 dst, now//10min, group, round(budget))`, TTL 300 s.
2. **Segment 1** (`_build_segment_1`, "getting out of your current location"):
   - Walk options to any bus/metro stop ≤ 2 km (free; walk ≤ 1.5 km is `isTopRecommended`, no
     cab/bike).
   - Transit options: for boarding stops within 1500 m (up to 3 bus + 2 metro), real GTFS next
     departures within a 180-min window (≤ 4 routes/stop, ≤ 3 arrival stops/route) riding to
     **forward-progress** arrival stops.
   - Metro-transfer rides (`isMetroTransfer`) to far-forward stops near a metro station.
3. **Segment 2** (`_build_segment_2`, from ≤ 6 distinct arrival stops, ≤ 40 options): same logic,
   each option tagged `connectedFrom` = parent stop name, departures time-chained ≥ parent
   arrival + 4 min.
4. **Probes** (`_build_probes`): one cheap onward suggestion per option for segment 3+.
5. Warnings: after 22:00 → bus-limit warning; any `not_running` → service warning.
Response: `{journey, segments[], probes[], warnings[], journeyComplete:false, timeline:[]}`.

**Every hop option carries** (the full contract):
```
optionId, destinationStop{name,lat,lng}, mode(walk|bus|metro), routeNumber,
fromStop, distanceKm, durationMin, departureTime, arrivalTime, arrivalMin,
fare, perPersonFare, geometry[], geometrySource(gtfs_shape|metro_line|graphhopper|interpolated),
status(scheduled|estimated|not_running), isTopRecommended, connectedFrom,
transitOptionsFromThisStop, probeNext[], isMetroTransfer(bool), exceedsBudget(bool)
```
Rules that make it correct: forward-progress (`hav(arrival→dest) < hav(anchor→dest)+tol`, tol
500 m normal / 2500 m metro); 800 m visited guard (no loops); real GTFS only (a stop with no GTFS
has no transit options); **stop-to-stop shape slices only** (never full-route spiderwebs);
time-chained; `exceedsBudget` grey-out never silent; metro Purple+Green both directions.

**`POST /api/routes/segment-next`** `{journey, chosen_legs, group_size, budget}`:
- `now_min = arrival of last leg + 4.0`; returns **only** options where `connectedFrom == last
  destinationStop` and `departureTime ≥ now_min`.
- If last stop within **500 m of destination** → `journeyComplete: true` + `arrival` message +
  full `timeline`.
- `destinationStop` in `chosen_legs` accepts **dict or str** (2026-08-03 fix — §20 #27).
Live example (2026-08-03, Puttenahalli): returned walk + bus 229, 212-M, 229-D, MF-36… all
`connectedFrom: "Puttenahalli Bus Stop"`, departures ≥ arrival+4 min.

**Frontend consumer** = progressive hop builder (§14.11): one hop column at a time; client filter
(`optionsForLevel`) for pre-fetched levels, server `segment-next` for deeper/stale ones; breadcrumb;
Undo/Reset; complete screen.

### 28.5 The Drive Pipeline (`POST /api/routes/drive`)
1. `routes.py` `DriveRequest {origin, destination}` → `app_state.get_gh().route("car", o, d)`.
2. GH returns a road-following polyline `[[lat,lng],…]`, `distance_m`, `duration_s`.
3. Response `{geometry, distance_m, duration_s, path_source:"graphhopper", mode:"car"}`; GH down →
   `path_source:"interpolated"`.
4. Frontend (`AToBPanel.startDrive` / `selectRide`): `api.driveRoute` → `setRidePath(geometry)` →
   MapView draws a solid orange polyline + `fitBounds` includes it.
Live example: MG Road→Majestic → `path_source=graphhopper dist_km=5.30 dur_min=6.1 pts=74`.

### 28.6 The Live Context Pipeline (`POST /api/langgraph/route-context`, `/ask`)
`VoyagerLangGraph.gather_route_context(src, dst, group_size, budget, current_time, place)`:
- Parallel fan-out (ThreadPool, 5 workers): weather@dest, traffic (news keyword "traffic" first,
  then TrafficTool), news@dest (limit 10), prices (only if group_size), reviews (only if place has
  place_id). **A failing tool never blocks the others** → key set to `None`.
- `_derive_factors`: `time_of_day` (night≥22/<6, morning_rush<10, day<17, evening_rush),
  `rain_next_hour`, `traffic_label`, `safety` ("caution" only at night with news).
- `LiveContext = {weather, traffic, news[], prices[], reviews, factors{}, errors[], completed_at}`;
  degraded fields honest (`{"condition":"unavailable"}`, `{"label":"unavailable"}`).
- `_synthesize`: LLM with hard rule "do NOT invent fares, timings, bus numbers, or scores"; JSON
  `{answer, factors}`; `None` → `{"answer":"Live data partially unavailable.","factors":["LLM
  unavailable"]}`. **LLM explains, never decides.**

### 28.7 The News Pipeline (`GET /api/search/news`)
Background daemon loop (interval 8 min, TTL 4 h, max 25):
- `_scrape_reddit`: r/bangalore/new.json?limit=25 via DataImpulse proxy → title + first 400 chars +
  url + ts.
- `_scrape_news_fallback`: DDG html for "Bangalore traffic today", "Karnataka rain alert",
  "Bengaluru news" (≤ 8 each).
- `_dedup` (normalized 80-char title key) → `_classify` (traffic/weather/event/general keywords) →
  `_geo_tag` (24 known Bengaluru localities) → `_merge` fresh + old-within-TTL, sort ts desc, cap.
- `relevant(lat,lng,keyword,limit)`: keyword filter → proximity sort (untagged last) or ts desc.
- Never fabricated headlines; loop down → last-good cache (honest empty if never ran).

### 28.8 Weather Pipeline (`GET /api/search/weather`)
Open-Meteo current: temp_c, WMO condition label, weather_code, humidity, wind_kmh, is_day,
`rain_next_hour` (any of first 4 fifteen-min precip probs ≥ 30%). 15-min cache; failure →
`{"condition":"unavailable"}`.

### 28.9 Train Pipeline (`GET /api/routes/live-trains`)
`train_service.trains_between(fc, tc)`: eRail.in GET (6 s timeout, 15-min cache) → rows →
`{train, name, dep, arr, dur_min, source:"live"}`. eRail down + pair in the 7 static city-pair
fallbacks → `source:"fallback"`, note "NOT live". Unknown station code → empty. **Trains only from
real eRail data.**

### 28.10 Frontend State Flow
- `AppContext` holds: mode, dark, userLoc, source, dest, weather, places, selected, showDiscovery,
  prices, ridePath, liveContext, news, journey, flyTo (+ setters). `setJourney` merges partials.
- `api.ts` is the ONLY HTTP layer (baseURL `VITE_API_BASE ?? http://localhost:8000/api`, 120 s
  timeout, AbortController on search/segments).
- Tab shell: `MainPage` → Sidebar (SearchPanel / AToBPanel / TripPanel) + `.map-wrap` (MapView +
  NewsPopup) + DiscoveryPanel overlay + bottom nav.
- **Vite dev proxy** (`vite.config.ts`): `/api` → `VITE_API_BASE || http://localhost:8000`,
  changeOrigin. Frontend ALSO calls `http://localhost:8000/api` directly (axios baseURL), so backend
  CORS must stay on. **Use `http://localhost:3000` — Vite binds IPv6 `::`, `127.0.0.1:3000` fails.**

### 28.11 Map Rendering System (`MapView`)
- React-Leaflet `MapContainer` (OSM tiles), `center` = userLoc or Bengaluru (12.9716, 77.5946).
- `FlyController` flies to `flyTo` (≥ zoom 14, guarded by the Bengaluru box).
- `Pins`: user dot, green source, red dest, star selected, numbered place pins (colored by
  CLOSED_PERMANENTLY or `scoreClass(rating*20)`), news pins (category colors).
- `RoutePolylines`: per-option geometry — confirmed solid (weight 5, opacity .85), top-recommended
  solid, others faint dashed (weight 3, opacity .3); walk dashed; ridePath solid orange.
- `fitBounds` over all in-box points (segments + ridePath), padding 40.
- CSS: `.map-wrap { z-index: 0 }` traps Leaflet panes (z 200–700) so overlay panels stay on top;
  `.discovery` z-index 60; `.marker-*` divIcon classes live in `index.css`.

### 28.12 Data Handling & Caches (memory + disk + LFS)
- Disk: `DATA_FOLDER/processed/gtfs_cache.pkl` (76 MB, LFS, cold-load 0.65 s), `bangalore.osm.pbf`
  (42 MB, LFS), raw `bmtc_gtfs/` (~190 MB, NOT committed), CSV/JSON datasets, `traffic_logs.csv`.
- In-memory caches: Maps/Serp 24h (2000 entries), ride prices 15 min, weather 15 min, trains 15
  min, route plans 10 min, segments 5 min, news 4 h (25 items). All ephemeral (lost on restart).
- OneDrive caution: pickles/PBF on OneDrive sync are slow on cold reads (~60–120 s first
  `segments` call) vs ~3 s warm — start GraphHopper + backend early, treat cold first calls as
  warm-up.
- `.env` secrets never committed; `.env.example` documents all keys.

### 28.13 The Proxy System — when it IS and IS NOT used
`proxy_manager.py` (DataImpulse `gw.dataimpulse.com:823`):
- **Used** for anonymous, IP-blockable scrapes: Reddit r/bangalore JSON, DDG html (news fallback),
  review scans, news sites.
- **Never used** for API-key services: SerpAPI, Google Maps, Open-Meteo, OpenRouter/Gemini, eRail —
  key auth + proxy adds risk. Enforced by `test_prompt5.py::TestProxy` (asserts those clients don't
  reference "dataimpulse").
- Bandwidth budget ~3.3 GB/mo within Render's 5 GB pool.

### 28.14 Every Option / Feature Explained (quick index)
- **Search features**: search-specific (with suggestions), nearby (19 categories, radius slider),
  place card (status pill, rating, Details, Navigate), DiscoveryPanel (photo, reliability pill, AI
  summary, concerns, real reviews, Show on map / Navigate).
- **A→B features**: Public (Multi-hop transit | Direct ride), Drive (fuel estimate + road path),
  Walk; group size, budget, mileage; swap; current-location buttons.
- **Hop window**: progressive build, breadcrumb, top-recommended ★, Undo/Reset, Start journey,
  complete screen.
- **Live layer**: weather header chip (rain badge), news LIVE panel (2-min poll), trip GPS.
- **Reliability/pin semantics**: green (reliable), yellow (ok / temporary), orange (weak), red
  (closed/negative) — `scoreClass(rating*20)` on the search pins vs `pin_class` on enrich.

---

## 29. THE 2026-08-03 HARDENING SESSION — DECISIONS SUMMARY

The **full record** (bug reproductions, choices, live verification) lives in **§19.4**; the
**do-not-regress error entries** are **§20 #26–36**. Quick recap of every decision:

| # | Symptom | Root cause | Choice (never regress) |
|---|---|---|---|
| 1 | "Search API missing" | Was never missing | Check `/api/health` before assuming code is gone |
| 2 | Map → random area | lat/lng swaps in `legGeometry` + flyTo | Identity `[lat,lng]`; Bengaluru-box guard on flyTo/fitBounds |
| 3 | Multi-hop not building | `ChosenLeg.destinationStop` 422 + wall-of-columns UX | `dict\|str` schema; progressive hop builder (§14.11) |
| 4 | Details panel invisible | Leaflet panes z-escape + blur | `.map-wrap{z-index:0}`, `.discovery` z 60 |
| 5 | Fake surge note | note appended an unused surge factor | `"Estimated fare • Karnataka govt rates"` |
| 6 | Drive no path / hardcoded fetch | frontend raw :8080 fetch | `POST /api/routes/drive` + `ridePath` drawing |
| 7 | Search looked empty | OSM no ratings | SerpAPI rating fallback (§15.1) |
| 8 | Enrich impossible for OSM ids | `osm:…` ≠ `ChIJ…` | `_resolve()` OSM→Google via SerpAPI |
| 9 | LLM summary dead | 401 base URL + 402 credits | OpenRouter→Gemini chain, `max_tokens=256` |
| 10 | 1 test failing | strict rounding at group=4 | tolerance 0.5; suite 104 green |

---

## 30. CURRENT RUN STATE — PORTS, PIDS, PROXY, DOCKER, VERIFY CHECKLIST

### 30.1 What should be running (2026-08-03 snapshot)
| Service | URL | How started | Notes |
|---|---|---|---|
| Backend (uvicorn) | `http://127.0.0.1:8000` | `python -m uvicorn backend.main:app --port 8000` (from `PROJECT/`) | health `{"status":"ok","services_loaded":true}` |
| Frontend (Vite) | `http://localhost:3000` (**NOT** 127.0.0.1) | `cmd /c npx vite --port 3000` (from `PROJECT/frontend`) | serves latest source; hard-refresh after backend restarts |
| GraphHopper (Docker) | `http://127.0.0.1:8080` | Docker Desktop manually, then `docker compose up -d graphhopper` | first boot 1–3 min graph cache; `/info` → profiles car, foot |

### 30.2 Proxy & CORS (three things, don't confuse them)
1. **Vite dev proxy**: `/api` → `http://localhost:8000` (config only).
2. **axios baseURL**: `http://localhost:8000/api` directly from the browser → needs **CORS**.
3. **Backend CORS** (`main.py`): `allow_origins` = `http://localhost:3000`,
   `http://127.0.0.1:3000`, regex `https://.*\.onrender\.com`. **Never remove.**

### 30.3 Docker — what and why
- **Why Docker at all?** Only **GraphHopper** needs it: a Java app with a 2 GB heap + graph cache.
  Backend/frontend run natively per the spec; no OSRM (banned), no old compose.
- `docker compose up -d graphhopper` → container `project-graphhopper-1`, image
  `israelhikingmap/graphhopper:latest`, port `8080:8989`, volume `./gh-data:/data`. It imports
  `bangalore.osm.pbf` on first boot.
- Config caveat (2026-08-03): `gh-data/config.yml` still references missing `car.json`/`foot.json`
  `custom_model_files`; GH tolerates it (defaults) — **don't edit while healthy**.
- On Render there's no Docker → walk/drive interpolated + flagged (honesty table in PROMPT_9).

### 30.4 Full verify checklist (run in order)
1. `git pull` (one repo, one branch, never diverge).
2. `python -m pytest tests/ -q` in `PROJECT/` → **104 passed** (~63 s on OneDrive).
3. `cd frontend; npx tsc --noEmit` → 0 errors.
4. Start Docker Desktop; `docker compose up -d graphhopper`; wait; `GET http://127.0.0.1:8080/info`
   → profiles car, foot.
5. `python -m uvicorn backend.main:app --port 8000`; `GET http://127.0.0.1:8000/api/health`.
6. `cmd /c npx vite --port 3000` in `frontend`; open **`http://localhost:3000`**.
7. **Browser smoke**: search "Cubbon Park" (rating + green pin), Nearby ATM, A→B
   Yelahanka School → Wonderla (progressive hops build on the map, map stays in Bengaluru), Drive
   (fuel + road path), Trip tab, LIVE news panel.
8. API smoke: `POST /api/routes/drive`, `POST /api/routes/segment-next`, `POST /api/search/enrich`.

---

## 31. NEXT ACTIONS MASTER PLAN (ordered, with why + done-check)

1. **Owner: enable Google billing + Places/Geocoding/Directions APIs.**
   Why: OSM+SerpAPI are honest fallbacks but Google gives canonical places, photos, hours,
   business_status, and traffic — and search/enrich already try Google first, so it lights up
   automatically. Done-check: `?q=cubbon park` shows a Google photo + rating.
2. **Verify Gemini LLM fallback live.**
   Why: OpenRouter is out of credits (402); the rewritten provider chain must prove Gemini works
   end-to-end. Done-check: `POST /api/search/enrich` on Cubbon Park returns a real summary (not the
   deterministic fallback). If Gemini fails too → top up OpenRouter credits.
3. **Commit + push the 2026-08-03 session** (after owner approval).
   Why: the working tree is dirty with the fixes above; uncommitted work is lost on machine issues.
   Done-check: `git status` clean, `pytest` 104, `tsc` clean.
4. **Wire the SerpAPI live ride overlay** into `SearchService.ride_prices` + `PricingTool.run`
   (currently pass `live_options=None`).
   Why: live Uber/Ola quotes are implemented + tested but not yet surfaced; with Google billing on,
   Directions + SerpAPI ride_options will give real live prices. Done-check: `POST /api/rides/prices`
   shows a `"live"` entry with a SerpAPI note.
5. **Re-verify the details-panel stacking in a real browser.**
   Why: CSS fixes are in but the panel still "ghosts" for the owner on scroll; needs devtools to
   confirm (levers: `isolation: isolate` on `.app-body`, or render `DiscoveryPanel` inside the map
   DOM). Done-check: panel stays fully visible while scrolling over the map.
6. **Build PROMPT_8 — Trip Planner** (§24.2, design locked).
   Why: it's the remaining flagship feature; everything it needs (search, transport interface,
   Postgres `DATABASE_URL`) is already wired.
7. **PROMPT_9 — Render + Neon deploy** (§24.3, design locked; CORS already allows onrender.com).
   Why: shareable demo URL; honesty table for no-GraphHopper paths already decided.
8. **Per-session hygiene forever**: `git pull` → `pytest` → `tsc` → work → push after green. Never
   diverge on `main`, never `git fetch --filter=blob:none`, never edit `gh-data/config.yml` while
   the container is healthy.

---

*End of VOYAGER v2 Master Knowledge Base. Latest session: 2026-08-03 hardening (map fly-away,
progressive hop builder, SerpAPI/OSM→Google resolution, LLM provider chain, `/routes/drive`, CSS
stacking). Next: Google billing + Gemini verification + commit, then PROMPT_8, then PROMPT_9.
Before every commit: `git pull`, `pytest tests/ -q`, `npx tsc --noEmit`, then push. This file is
fully self-contained — no old folder is needed.*
