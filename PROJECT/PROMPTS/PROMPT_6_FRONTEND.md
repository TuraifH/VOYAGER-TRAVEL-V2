# PROMPT 6 — VOYAGER v2 Frontend (Web, Glassmorphism Rebuild)

> **⚠ BUILD RULE (read every time):** This project is being built **from scratch** in `PROJECT/`. The parent `VOYAGER` repo (`backend/`, `frontend/`, `ml/`, `scripts/`, etc.) is **reference-only for past mistakes** — NEVER import, read for implementation, or "fix" anything there. All code, all decisions, all data contracts come from these prompt files + `PROJECT/DATA_FOLDER/`. Do not reintroduce old code or old bugs.

> **Hinglish intent line:** Frontend "the face" hai — stunning, dynamic, real. Glassmorphism design system KOI NAHI hata raha (index.css ka base rahega), lekin SEGMENT WINDOW ko poora naya banana hai — stitch_omnipath reference jaisa: 3-column hop cards, breadcrumb timeline, har hop ke selection pe map highlight + camera pan. Search, A→B, Trip teen tabs, map dynamic, green/yellow/red pins, hover pe uplift + review summary, loading skeletons, live GPS tracking, news LIVE panel, dark mode, mobile responsive. KABHI bhi fake/static/placeholder data render nahi karna — backend jo dega wahi dikhana. `tsc --noEmit` zero errors mandatory. Web app first; native app BAAD me.

---

## 1. Goal

Rebuild the React/TS web frontend on the existing glassmorphism design system, wiring every UI surface to the VOYAGER v2 APIs. Frontend is a **dumb renderer + local filter** — all logic lives in the backend.

## 2. Stack & Conventions

- Vite + React 19 + TypeScript, Leaflet + react-leaflet for map, **framer-motion** for all
  transitions/motion, **react-leaflet-cluster** (+ leaflet.markercluster) for pin clustering,
  Material Symbols for icons, Inter font.
- `AppContext` for global state (mode, location, markers, routing state, journey, dark mode, weather,
  discovery panel, prices, hoveredPlaceId, searching/searched, radiusKm).
- Axios client (`services/api.ts`) with typed interfaces, AbortController, 120s timeout.
- Styling is **plain CSS with design tokens** (`index.css` vars + per-component CSS) — NOT Tailwind.
- **Gate: `npx tsc --noEmit` must pass with zero errors.** No `any` for API payloads — full typed
  contracts matching the backend JSON schemas.

## 3. Layout (MainPage.tsx)

```
┌────────────────────────────────────────────────────────┐
│ HeaderBar: clock, weather, location, dark-mode toggle   │
├──────────────┬─────────────────────────────┬───────────┤
│ Sidebar      │                             │ Discovery │
│ (Search /    │       MAP (Leaflet)         │ Panel     │
│  A→B / Trip) │                             │ (right)   │
│              │  ● user ● source ● dest     │           │
│              │  green/yellow/red pins      │           │
│              │  route polylines per leg    │           │
├──────────────┴─────────────────────────────┴───────────┤
│ Bottom pill nav: SEARCH | A→B | TRIP                    │
└────────────────────────────────────────────────────────┘
```
- On mobile (≤768px): sidebar full-width, 40vh max height, bottom tabs icon-only.

## 4. Map (MapView.tsx)

- Tile layer: OpenStreetMap (keep attribution). Zoom controls glass-styled.
- **Dynamic movement:** selecting a result/hop → `map.flyTo` / `fitBounds` to show it; user location button re-centers with pulsing ring.
- **Markers:**
  - User location: blue pulsing dot (watchPosition when journey active).
  - Search pins: green/yellow/red sized by reliability class (green normal+glow, red small+dim).
  - Nearby results: numbered circular markers (10-color cycle), matching card index.
  - Source: green "trip_origin" pin; Destination: red pulsing pin.
  - Selected place: larger pulsing star pin.
  - News: small `!` markers colored by category.
- **Hover uplift:** marker scales 1.15×; shows mini popup with name + rating + reliability + hours.
- **Nearby pins (2026-08-04 polish):** numbered pins drop in with a **staggered CSS animation**
  (`pin-wrap` wrapper, 60ms × index, `cubic-bezier(0.22,1,0.36,1)`), and hover-sync with result
  cards: hovering a card toggles a `.hot` class (scale 1.3 + primary glow) directly on the pin's DOM
  element via a `pinEls` ref map (never `setIcon` — that would replay the drop animation); marker
  `mouseover/mouseout` write `hoveredPlaceId` so the card highlights back.
- **Clustering (2026-08-04):** numbered nearby pins render inside `MarkerClusterGroup`
  (`maxClusterRadius:48`, `chunkedLoading`, `spiderfyDistanceMultiplier:1.6`,
  `showCoverageOnHover:false`). Custom `clusterIcon(cluster)` → `divIcon` count bubble, tiers:
  <10 purple / <50 deep purple / ≥50 teal, hover scale 1.15 (CSS in `index.css`, dark-theme styled).
- **Live radius circle (2026-08-04):** dragging the Nearby slider pushes `nearbyBase` through context
  **at animation-frame rate** (rAF-throttled in `SearchInput.onRadiusChange`) → `<Circle>` on the map
  grows/shrinks in real time, not just the "X km" label.
- **Route polylines:** colored per leg mode (transit=primary, walk=secondary dashed, connecting=orange, drop-off=amber). **Real geometry only** — straight lines only if `geometrySource: "interpolated"` (render a dashed + "approx path" tag).
- **Accumulated paths:** each confirmed hop appends its geometry; map fits full journey.

## 5. HeaderBar

Clock (12h, updates/sec), weather icon + temp (from `/api/search/weather`), location name (reverse geocode), dark-mode toggle (sun/moon). Glass bar, subtle border.

## 6. SearchPanel (Search Mode)

Two floating glass windows over the map (see §12 for the glass treatment): `.input-window`
(top-left) = `SearchInput`; `.results-window` (below it) = `SearchResults`. Both `z-index:900`.

**Tabs (Search ↔ Nearby) — segmented control (2026-08-04 polish):**
- Active pill is a shared `motion.span layoutId="seg-pill"` → the background **slides/morphs**
  between tabs (spring, stiffness 420/damping 34), never an instant color swap.
- View swap = `AnimatePresence mode="wait"` cross-fade + 8px vertical slide + **scale depth**
  (outgoing → 0.98, incoming 0.98 → 1) — no abrupt layout swap.

**Search specific:**
- Icon button **morphs**: magnifying glass → inline spinner (query in flight) → "X" clear once text
  exists (AnimatePresence mode="wait" on each glyph).
- Debounced (300ms) live suggestions ≥2 chars: glass dropdown, **staggered slide-in per row**
  (35ms × i), **keyboard navigation** (ArrowUp/Down + Enter + Escape, `aria-activedescendant`),
  matching substring wrapped in `<mark>` (primary-tinted highlight).
- Input container glows (`:focus-within` 4px primary halo).
- Results as cards (name, address, distance badge, type, star rating, hours, reliability pill
  colored, photo thumbnail, hotel price range if stay-type, AI review summary, expandable real
  reviews, "Details" + "Navigate" buttons). Card bg + left border colored by reliability class.

**Search nearby:**
- 19 category chips (ATM, Bank, Hospital, Pharmacy, Restaurant, Cafe, Hotel, Mall, Petrol Pump,
  EV Station, Supermarket, Park, Bus Stop, Metro, Temple, Police, School, Gym, Cinema) —
  **multi-select**, each with a Material icon + animated ✓ checkmark; spring pop
  (0.9 → 1.08 → 1) on toggle; **ripple burst from the tap point** (DOM span, 300ms, GC'd);
  hover lift 2px; stagger in 50ms × i on first mount. Count badge below ("3 selected").
- Radius slider (0.5–10 km, step 0.5, snap ticks at 0.5/1/2/5/10 km): thumb scales up + floating
  tooltip pill ("2 km") while dragging; filled track = primary gradient; **live radius circle on the
  map at rAF rate** (§4).
- **"Find nearby" CTA:** on click → inline spinner "Finding…" → brief checkmark "Found" (1.5s) →
  idle; press scale 0.97; glow hover; after **8s idle** (once per session) a breathing box-shadow
  pulse until first interaction.
- **Location pinned banner:** after Search Specific picks a place, "Near {name}" chip seeds Nearby
  around that place (Clear button).
- **Navigate** button → switches to A→B with dest pre-filled.

**Results window (2026-08-04 polish):**
- While a search is in flight → **shimmer skeleton cards** replace the list in place (context
  `searching`), not a floating spinner.
- Zero results after a search → explicit empty state: `search_off` icon (spring scale-in), "No
  places found at X km.", and a **"Widen search radius"** button that bumps radius (+3km, capped)
  and re-triggers the search. Cross-window trigger = `CustomEvent("voyager:rerun-nearby")` on
  `window`, listened to by `SearchInput` (switches to Nearby tab if needed).
- Result cards: staggered entrance (60ms × i, capped 0.54s); **rating counts up 0 → value over
  400ms** (`animate()` from framer-motion, delayed until card lands); **distance badge** = teal
  `badge.info` with `near_me` icon sliding in after the card; open/closed = teal `info` / amber
  `warn`.
- **Hover sync:** hovering a card sets `hoveredPlaceId` → map pin `.hot` bounce + glow; hovering a
  pin highlights the card (vice-versa).

## 7. DiscoveryPanel (right-side glass panel)

Opens on "Details": hero image (real photo), name + reliability pill, type badge, address, rating, distance, hours, hotel price card (when applicable), **AI review summary box** (colored, with red `concerns[]`), up to 5 real reviews, "Show on Map" + "Navigate Here" buttons. Loading skeleton (shimmer with place name) while enriching.

## 8. AToBPanel (A→B Mode)

- Source input (autocomplete, green check when confirmed, "Current Location" option), Destination input (red), Swap button, map flies to dest on confirm.
- **Travel sub-modes:**
  - **Public / Online** → splits:
    - **Multi-Hop Transit** → opens SegmentFlowView (below).
    - **Direct Ride** → ride cards (Uber/Ola/Rapido/Auto): provider, mode, price (₹), **Live/Estimated badge**, ETA, expand/collapse; click → drive geometry on map.
  - **Drive** → driving route + **fuel cost** (live petrol price × distance / mileage; mileage adjustable input), GraphHopper car geometry.
  - **Walk** → walking route for short distances.
- **Group Size + Budget inputs** (numeric). Budget filters routes.
- **Find Routes** → loading spinner; route cards with rank badge, mode icon, fare, duration, walk km, transfers, score bar 0-99 colored, per-criterion explanation, "Best Match" tag on rank 1. "View Steps" → leg-by-leg step viewer (mode icon, from→to, time, fare, instructions, Next/Prev). "Start Journey" → GPS tracking. "Show All Options" expander for routes 6+.

## 9. SegmentFlowView (the new hop window — THE centerpiece)

> **Hinglish intent:** Ye window Google Maps jaisa feel de — user har column me stop choose kare, uske saath map me wo hop highlight ho, breadcrumb timeline bane, aur aage ke columns automatically filter ho (connectedFrom match). Segment 1+2 pehle se render honge (backend ne de diya), segment 3+ pe lazy fetch.

### 9.1 Layout (3-column interactive hop window)
- **Breadcrumb trail** at top: `Source → [bus 507-D] → Kogilu Cross → [KIA-9] → Majestic → [Purple] → Challaghatta → ... → Destination`. Each confirmed hop color-coded by mode.
- **Columns (segments):** one column per segment. Each column:
  - Header: "Segment N: <title>"
  - **Hop cards:** destination stop name, mode icon, route number (color-coded metro purple/green), from→to, distance, duration, departure/arrival times, fare (₹), status badge (scheduled/not running), next-departures list (up to 6) for buses, "Top Recommended" gold star, running status (strikethrough if not running).
  - **Walk card** first when ≤2km ("Free", duration).
  - Short hops (≤1.5km): **no cab cards** — walk only (backend enforces; UI must not show rides it didn't get).
  - Card shows `transitOptionsFromThisStop` count.
- **Filtering:** when user selects a hop, the NEXT column filters to `connectedFrom === selected.destinationStop` (client-side, instant). Selecting a different hop in an earlier column **resets downstream selections** (no ghost paths).
- **Lazy fetch:** if the user reaches a column beyond what was pre-fetched, call `POST /api/routes/segment-next` with chosen legs → replace that column + probes. Show "Finding onward connections..." spinner during fetch.
- **Map interaction:** hovering/selecting a hop card → highlight that hop's geometry on map + pan/fit. Confirmed hops accumulate on map.
- **Probes:** last column shows "possible next options" (probes) greyed, expanding on confirm.
- **Confirm & Continue:** locks the hop into the breadcrumb, advances.
- **Journey complete:** when `journeyComplete` — show "You have reached [destination]" screen: total time, total fare, segment count, full timeline list (each leg with times + fares), Reset button.
- **Time-of-day advisories:** warning chip at top when late night/early morning (e.g., "It's late — cab/auto is safest").
- **Visual:** glass cards, hover lift, selected border glow, gold star for top-recommended, loading skeletons per column. **Nothing dull — motion everywhere (slide-up, fade-in, scale-in).**

## 10. TripPanel (Trip Mode)

- AI travel insight box, "Create New Trip" (→ A→B), Your Trips list (empty state), Active Journey panel (pulsing green dot, live coords, End Journey), day-based tabs (scaffold).

## 11. NewsPopup

Floating glass LIVE panel: "LIVE" badge with pulsing dot, auto-refresh every 2 min (poll `/api/search/news`), category left-border colors, dedup (max 15), dismiss button. Geo-tagged items become map markers.

## 12. Design System (keep + extend)

- Keep `index.css` variables: `--primary`, `--secondary`, `--error`, glass classes, score color map (green ≥70, yellow ≥50, orange ≥30, red <30).
- **No hardcoded dark hexes** in components — always CSS variables (dark theme via `.dark` overrides).
- New: hop-card, breadcrumb, timeline, skeleton, marker-glow classes in the SAME design language.
- Animations: slide-up/fade-in/scale-in, pulse ring (user/dest), pulse dot (live), shimmer skeletons, spin loader, hover-scale.

### 12.1 Floating-window glassmorphism (2026-08-04)
- `.input-window` / `.results-window` are **translucent glass**, not flat fills: dark
  `rgba(15,20,35,0.72)` / light `rgba(255,255,255,0.68)`, `backdrop-filter: blur(20px) saturate(1.4)`
  + `-webkit-` prefix (Safari/iOS). **Blur is static — never animate it** (repaint cost); entrance
  animations animate opacity/transform only.
- Fake light source: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.08)` on the **top edge only**;
  other three sides keep the hairline `--panel-border`. Outer elevation: `var(--shadow)`.
- Fallback `@supports not (backdrop-filter…)` → near-opaque `rgba(15,20,35,0.94)` / white 0.94.
- Nested content (chips, inputs, CTA) stays **flat opaque** (`var(--panel)`/`--panel-strong`) — no
  stacked blur layers. Blur works because `.map-wrap` (`z-index:0`) sits behind the windows
  (`z-index:900`).
- Contrast rule: panel fill between 60–80% opacity so text stays legible over bright map tiles.

### 12.2 Motion language (2026-08-04, all panel/UI motion)
- One easing everywhere: `cubic-bezier(0.22, 1, 0.36, 1)`; pops use springs
  (stiffness 420–600 / damping 24–34). **transform/opacity only** — never animate layout
  properties (width/height/inset); auto-height handled by framer `layout`.
- `prefers-reduced-motion` respected two ways: framer `MotionConfig reducedMotion="user"` + CSS
  media query killing animations/transitions in the panel and pin-drop.
- Every interactive element has a visible `:focus-visible` ring (2px primary + offset) and is
  Tab-reachable (segmented tabs, chips, suggestions, slider, CTA, cards).
- Idle/ambient: CTA "breathing" glow after 8s idle (once per session, stops on first click); chips
  stagger on first mount only.

### 12.3 Color hierarchy (2026-08-04)
- **Purple `--primary` = selection + primary action only** (tab pill, active chip, CTA, selected
  states, score-pill classes).
- **Teal `--secondary` (#00cec9) = status/info** — distance badges, "Open now", cluster bubbles
  ≥50, live/info elements: `badge.info`.
- **Amber `--warn` = warnings/closed** (`badge.warn`). Red = errors/closed-permanently.
- Nothing else borrows purple for passive info — one clear visual language per state.

## 13. Data Hygiene Rules (frontend)

1. **Render exactly what the backend sends.** No mock/default/fallback sample data in the UI.
2. If a field is missing → show nothing or an explicit "Unavailable" state — never a fake value.
3. `source: "estimated"` prices and `geometrySource: "interpolated"` paths MUST be visually labeled.
4. Abort stale requests (AbortController) when inputs change (prevents race-condition ghost states).

## 14. Type Contracts (types/index.ts)

Define TS interfaces mirroring backend JSON exactly:
`SegmentResponse, Segment, HopOption, JourneyComplete, ScoredRoute, PlaceResult, PlaceDetails, Review, RidePrice, LiveContext, NewsItem, WeatherNow, RoutePlan, Leg`. No loose `Record<string, any>` for these.

## 15. Acceptance Criteria

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] Three-tab bottom nav works; mode transitions clear route geometry
- [ ] Search Specific + Nearby return REAL results with reliability pills, hours, photos
- [ ] Green/yellow/red pin rendering matches reliability classes
- [ ] A→B: Direct Ride shows Live/Estimated labels; Drive shows fuel cost with adjustable mileage; Walk works
- [ ] SegmentFlowView: columns render from `/api/routes/segments`; selection filters next column client-side; downstream resets on earlier change; lazy `segment-next` works; breadcrumb + map highlight + journey-complete all correct
- [ ] News popup polls and shows real classified items; map `!` markers appear
- [ ] GPS tracking: start journey → pulsing blue dot follows user; end journey stops
- [ ] Dark mode consistent everywhere (no stray hardcoded hexes)
- [ ] Mobile responsive (≤768px) layout correct
- [ ] Segmented tabs slide the pill (layoutId) + crossfade/scale-depth view swap
- [ ] Chips: multi-select count + checkmark + icon + tap ripple; slider tooltip/snap + live map circle
- [ ] CTA morphs spinner → checkmark; idle glow after 8s, once per session
- [ ] Suggestions: keyboard-navigable, substring `<mark>` highlight, staggered rows
- [ ] Results: skeleton-in-place while searching; empty state + "Widen search radius" re-runs;
      rating count-up; teal distance badge
- [ ] Card ↔ pin hover sync both ways; pins drop in staggered; wide searches cluster (count bubbles)
- [ ] Windows are translucent glass (map visibly blurs through); `@supports` fallback; static blur only

## 16. Hand-off
- After this lands, PROMPT_7 wires ML + integration tests and the full end-to-end QA pass.
