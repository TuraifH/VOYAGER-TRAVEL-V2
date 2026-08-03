# VOYAGER v2 — Implementation Plan: News Fix + Hop Decision Tree + Window Split + Radius Circle

> Status: PLANNED (awaiting execution). Read alongside `MASTER_KNOWLEDGE_BASE.md` (§11 hop
> mechanism, §14 frontend, §32 hop-builder session, §33 news/photo session).
> Owner-confirmed decisions at the bottom (section "Confirmed decisions").

---

## 0. Goal (plain language)

1. **Fix the LIVE news window** — it currently does not show (renders behind the map). Move it to
   the TOP of the map and make it always visible above the map.
2. **Turn the hop window into a horizontal decision tree** — root = current location on the LEFT,
   branches = the hop/transport (walk, bus number, metro, ride), nodes = destination stops, final
   node = destination on the RIGHT. Edge length is proportional to the hop's distance compared to
   its sibling branches at the same stop ("average comparison", not real scale). Clicking any
   branch switches the path from that level and rebuilds the rest.
3. **Split the left UI into two separate windows** — a compact top-left input window and a results
   window floating below it. Detail panel stays on the right.
4. **Clear previous data on any new input** — when the user starts typing a new area or switches
   features, previous results/detail/radius/path are removed.
5. **Draw a radius circle on the map** for the Nearby search (matches the radius slider).

---

## 1. Part 1 — News popup fix (small, do first)

**Problem:** `.news-popup` is `position:absolute; left:12px; bottom:12px; z-index:30` rendered
inside `.map-wrap` (which is a stacking context at `z-index:0`). Leaflet panes run at 200–700, so
`z-index:30` sits **behind the map**. Also sits at the bottom where the flow-sheet appears.

**Change:**
- `frontend/src/components/NewsPopup.css`: move to the **top** (`top:12px; bottom:auto`),
  `z-index: 1000` (≥ Leaflet 200–700; inside `.map-wrap` it only needs to beat the map).
- `frontend/src/pages/MainPage.tsx`: keep `<NewsPopup />` inside `.map-wrap` (it will now be above
  the map). Position top so it never collides with the bottom flow-sheet.
- Do-not-regress: any map overlay must be `z-index ≥ 1000`; `.map-wrap` must keep `z-index:0`.

**Verify:** refresh `http://localhost:3000`, the LIVE news card is visible at the top of the map
with headlines (backend news loop already started in `main.py` — §33 of MASTER).

---

## 2. Part 2 — Stop-selection refinement (backend, one-go-to-destination)

**Problem:** arrival stops can be intermediate (Avalahalli/Honnenahalli) when the same bus could
take the user all the way to a stop near the destination (Rajanukunte). Owner wants: **if a bus
(or metro) can reach near the destination in one go, do NOT offer the previous stop.**

**Change — `backend/services/segment_builder.py`, `_spaced_arrival_stops`:**
- Keep the existing hard rules (forward progress toward destination, skip boarding stop, spacing
  ≥ `MIN_HOP_SPACING_M` 600 m, first arrival ≥ `MIN_BUS_HOP_M` 500 m).
- **Add a destination-proximity preference:** among the valid forward-progress candidates, prefer
  the stop **closest to the destination** (smallest haversine to destination). Bias the pick so the
  furthest-reaching / nearest-destination stop is the primary offered one; keep at most 2–3 arrival
  stops per route.
- Do the same for metro station arrival selection (station nearest to destination).
- Constants live near `MIN_BUS_HOP_M`/`MIN_HOP_SPACING_M` (§32.3); add a proximity threshold only if
  tests require it.

**Verify:** `python -m pytest tests/ -q` → must stay **104 passed** (especially the 14
`test_segment_builder` tests). Manual: Yelahanka 4th Phase → Sai Vidya Institute; a bus toward the
destination must offer the stop nearest Sai Vidya (Rajanukunte), not earlier micro-stops.

---

## 3. Part 3 — Window split (input window + results window) + clear-on-change

**Problem:** one full-height left `.sidebar` (380px) holds inputs AND results inline; detail/radius/
path are not cleared when the user changes inputs or switches features.

**Change:**
- `frontend/src/context/AppContext.tsx`: add transient state + a clear action:
  - `searchResults: PlaceResult[]`, `setSearchResults`
  - `nearbyBase: {lat,lng,radiusM} | null`, `setNearbyBase` (Part 4)
  - `rides: RidePrice[]`, `setRides`; `fuel: number | null`, `setFuel`
  - `clearTransient()` → resets searchResults, selected, showDiscovery(false), nearbyBase,
    rides, fuel, and (on tab switch) the A→B chosen path.
- `frontend/src/pages/MainPage.tsx` + `MainPage.css`:
  - Replace the single `.sidebar` with **two floating windows**: `.input-window` (top-left,
    compact: mode tabs + the Input component) and `.results-window` (floating below it,
    scrollable: the Results component). `.discovery` stays on the right.
  - Bottom tabs call `clearTransient()` on `setMode`.
- `SearchPanel.tsx`: split into `SearchInput` (tabs + search box / nearby controls) and
  `SearchResults` (place cards). Use context results instead of local `results`.
- `AToBPanel.tsx`: split into `AtoBInput` (mode tabs, source/dest autocomplete, group/budget/
  mileage) and `AtoBResults` (ride cards / fuel card). Ride prices/fuel stored in context.
- `TripPanel.tsx`: same split for consistency.
- **Clear-on-change rule (owner):** whenever the user starts typing a new area / clears an input /
  changes the search tab / switches the bottom feature → `clearTransient()`. Previous results,
  detail, radius, and path disappear.

**Verify:** tsc clean; manual — type a search then change tab → results/detail gone; switching
Search↔Nearby clears stale list; A→B rides clear when source/dest edited.

---

## 4. Part 4 — Nearby radius circle

**Change:**
- `MapView.tsx`: render `<Circle center={[nearbyBase.lat,lng]} radius={nearbyBase.radiusM}>`
  (semi-transparent fill + dashed stroke) when `nearbyBase` is set.
- `SearchPanel.tsx` (Nearby): on "Find nearby" set `nearbyBase = {lat,lng,radiusKm*1000}`; update
  it live while the radius slider moves (if a nearby search is active); clear on tab change / input
  clear (`clearTransient`).
- Style: `.nearby-radius { fill: rgba(108,92,231,0.08); stroke: var(--primary); stroke-dasharray:
  6 6; }`-ish, matching the app theme.

**Verify:** run Nearby at 2 km then drag slider → circle resizes on the map; leaving Nearby removes
it.

---

## 5. Part 5 — Horizontal decision-tree hop window (the big one)

**New file:** `frontend/src/components/HopTreeView.tsx` (+ `HopTreeView.css`)
**Edit:** `frontend/src/components/SegmentFlowView.tsx` — replace the `hop-col` vertical card list
with `<HopTreeView … />`. Keep breadcrumb, warnings, complete card, Undo/Reset/Start.

**Data (already available):**
- `journey.segments.segments[]` = levels; each `Segment.options[]` = branches from the confirmed
  stop at that level.
- `journey.chosenLegs[]` = the chosen path (`confirmed`).
- Each option: `mode`, `routeNumber`, `destinationStop {name,lat,lng}`, `departureTime`,
  `arrivalTime`, `durationMin`, `distanceKm`, `fare`/`perPersonFare`, `isTopRecommended`,
  `connectedFrom`, `transitOptionsFromThisStop`.
- `api.segmentNext(journey, prefix, group, budget)` rebuilds deeper levels from any prefix.

**Layout (SVG, left→right):**
- Depth 0 = source node (root, LEFT). Each level i = a horizontal slab.
- For each node at depth i, its children = the options at that level (`optionsForLevel`-filtered,
  capped ~3 per node). Edge from parent stop node → child stop node.
- **Edge length = option.distanceKm scaled relative to its siblings at the same node**
  (min-max or max-normalized within the node: `px = MIN_PX + (dist/maxDist)*slab`). Chosen-path
  edges solid/bold; alternatives dashed + faint.
- Nodes = rounded rects with the stop name + "→ X.X km to dest". Destination node (RIGHT) shown
  when `journeyComplete` or as the final walk.
- Colors: reuse `MODE_META` colors (bus purple, metro teal, train orange, walk grey, ride amber).

**Interaction:**
- Click any edge/node → `selectHopAt(depth, option)`: set `confirmed = prefix + [option]`, call
  `api.segmentNext(journey, confirmed, …)` to fetch deeper levels, prune stale deeper `levels`,
  fly map to the chosen leg end (reuse existing geometry logic), update `journey`.
- Tap a node → small detail card (times, fare per-person + per-group, km, onward options count).
- Undo/Reset/Start journey buttons preserved.

**Horizontal scroll:** tree scrolls horizontally inside the flow-sheet (`.flow-tree { overflow-x:
auto; }`), fixed height.

**Map sync:** unchanged — `RoutePolylines` already colors modes and faints non-chosen; clicking a
branch updates `journey` so the map redraws.

**Verify:** live smoke on the owner test case — Yelahanka 4th Phase → Sai Vidya Institute:
1. root = source; 2. branches = walk/bus to nearby stops; 3. pick a bus → its destination stop
   node (near-destination preferred, Part 2); 4. branches at that stop (bus numbers, no metro in
   Yelahanka); 5. near destination → walk branch → Sai Vidya = final node; 6. Start journey.
   Also test switching a branch mid-tree → different subtree; and a Purple/Green metro corridor.

---

## 6. Order of work + QA loop

1. Part 1 (news) → 2. Part 2 (backend stops) → 3. Part 3 (window split) → 4. Part 4 (radius
   circle) → 5. Part 5 (tree).

After each part (and before any commit):
- `python -m pytest tests/ -q` → **104 passed**
- `cd frontend; npx tsc --noEmit` → **0 errors**
- Live browser check at `http://localhost:3000`

Final: document the session in `MASTER_KNOWLEDGE_BASE.md` (new §34), then commit+push only on
owner approval. Commit message = the changes, no date.

---

## 7. Files touched

| Area | Files |
|---|---|
| News | `frontend/src/components/NewsPopup.css`, `frontend/src/pages/MainPage.tsx` |
| Backend stops | `backend/services/segment_builder.py` |
| Layout split | `frontend/src/pages/MainPage.tsx`, `MainPage.css`, `frontend/src/context/AppContext.tsx`, `SearchPanel.tsx/.css`, `AToBPanel.tsx/.css`, `TripPanel.tsx` |
| Radius circle | `frontend/src/components/MapView.tsx`, `SearchPanel.tsx`, `AppContext.tsx` |
| Hop tree | NEW `frontend/src/components/HopTreeView.tsx/.css`, `SegmentFlowView.tsx` |
| Docs | `MASTER_KNOWLEDGE_BASE.md` (after green) |

---

## 8. Confirmed decisions (owner, 2026-08-04 session)

- **Tree replaces the vertical option cards**; tapping a branch shows a small detail card for that
  hop.
- **Edge length = relative to siblings** at the same stop node ("average comparison", not exact
  scale).
- **Stop selection:** if a bus/metro can reach near the destination in one go, do NOT offer the
  previous stop — prefer the arrival stop nearest the destination (Rajanukunte over Avalahalli).
  Same rule for metro stations.
- **Clear behavior:** any new input / cleared input / feature switch removes previous results,
  detail, radius, and path.
- **News window:** keep it at the TOP, make it actually come/shown, never behind the map.
