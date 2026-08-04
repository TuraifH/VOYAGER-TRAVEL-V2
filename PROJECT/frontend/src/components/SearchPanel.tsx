import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, animate, motion } from "framer-motion";
import { useApp, scoreClass } from "../context/AppContext";
import { api } from "../services/api";
import type { PlaceResult } from "../types";
import "./SearchPanel.css";

const NEARBY_CATEGORIES = [
  "ATM", "Bank", "Hospital", "Pharmacy", "Restaurant", "Cafe", "Hotel", "Mall",
  "Petrol Pump", "EV Station", "Supermarket", "Park", "Bus Stop", "Metro",
  "Temple", "Police", "School", "Gym", "Cinema",
];

const CATEGORY_ICONS: Record<string, string> = {
  "ATM": "local_atm", "Bank": "account_balance", "Hospital": "local_hospital",
  "Pharmacy": "medication", "Restaurant": "restaurant", "Cafe": "local_cafe",
  "Hotel": "hotel", "Mall": "shopping_bag", "Petrol Pump": "local_gas_station",
  "EV Station": "ev_station", "Supermarket": "local_grocery_store", "Park": "park",
  "Bus Stop": "directions_bus", "Metro": "subway", "Temple": "temple_hindu",
  "Police": "local_police", "School": "school", "Gym": "fitness_center", "Cinema": "theaters",
};

// empty-state "widen search" button talks to the input panel through this bus
const RERUN_EVENT = "voyager:rerun-nearby";

const EASE = [0.22, 1, 0.36, 1] as const;
const RANGE_MIN = 0.5;
const RANGE_MAX = 10;
const SNAP_POINTS = [0.5, 1, 2, 5, 10];

// wrap <mark> around query-token matches inside a suggestion name
function highlight(text: string, query: string): ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// rating counts up over ~400ms once the card enters (transform/opacity-free, no layout)
function CountUp({ value, delay = 0.28 }: { value: number; delay?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, { duration: 0.4, delay, ease: EASE as unknown as number[], onUpdate: (v) => setN(v) });
    return () => controls.stop();
  }, [value, delay]);
  return <>{n.toFixed(1)}</>;
}

function PlaceCard({ place, index, onPick, onDetails, onNavigate }: {
  place: PlaceResult; index: number;
  onPick: (p: PlaceResult) => void;
  onDetails: (p: PlaceResult) => void;
  onNavigate: (p: PlaceResult) => void;
}) {
  const { hoveredPlaceId, setHoveredPlaceId } = useApp();
  const cls = place.business_status === "CLOSED_PERMANENTLY" ? "red" : scoreClass(place.rating ? place.rating * 20 : null);
  const hovered = hoveredPlaceId === place.place_id;
  const statusCls = place.business_status === "OPERATIONAL" ? "info"
    : place.business_status === "CLOSED_TEMPORARILY" ? "warn" : cls;
  return (
    <motion.div
      className={`place-card glass hover-lift ${hovered ? "hovered" : ""}`}
      style={{ borderLeftColor: `var(--score-${cls})` }}
      onClick={() => onPick(place)}
      onHoverStart={() => setHoveredPlaceId(place.place_id)}
      onHoverEnd={() => setHoveredPlaceId(null)}
      onFocus={() => setHoveredPlaceId(place.place_id)}
      onBlur={() => setHoveredPlaceId(null)}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: Math.min(index * 0.06, 0.54), duration: 0.32, ease: EASE }}
      layout
    >
      <div className="spread">
        <div className="row">
          <span className="marker-num" style={{ background: `var(--primary)` }}>{index + 1}</span>
          <div>
            <div className="place-name">{place.name}</div>
            <div className="muted small">{place.primary_type ?? place.types?.[0] ?? ""}</div>
          </div>
        </div>
        {place.rating != null ? (
          <span className={`score-pill ${cls}`}>★ <CountUp value={place.rating} /></span>
        ) : place.business_status ? (
          <span className={`score-pill ${statusCls}`}>
            {place.business_status.replaceAll("_", " ").toLowerCase()}
          </span>
        ) : null}
      </div>
      <div className="muted small truncate mt8">{place.address}</div>
      <div className="spread mt8">
        <span className="row">
          {place.user_rating_count != null && <span className="muted">({place.user_rating_count})</span>}
          {place.distance_km != null && (
            <motion.span
              className="badge info"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.06, 0.54) + 0.3, duration: 0.25, ease: EASE }}
            >
              <span className="material-symbols-outlined">near_me</span> {place.distance_km.toFixed(1)} km
            </motion.span>
          )}
        </span>
        {place.open_now != null && (
          <span className={`badge ${place.open_now ? "info" : "warn"}`}>{place.open_now ? "Open now" : "Closed"}</span>
        )}
      </div>
      <div className="row mt12">
        <button className="btn small" onClick={(e) => { e.stopPropagation(); onDetails(place); }}>Details</button>
        <button className="btn ghost small" onClick={(e) => { e.stopPropagation(); onNavigate(place); }}>Navigate</button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- results window
export function SearchResults() {
  const { searchResults, setPlaces, setPinned, setFlyTo, setSelected, setShowDiscovery, setDest, setMode,
    searching, searched, radiusKm, setRadiusKm } = useApp();

  const pickPlace = (p: PlaceResult) => {
    setPlaces([p]);
    setPinned(p);
    setFlyTo({ lat: p.lat, lng: p.lng });
  };

  const openDetails = async (p: PlaceResult) => {
    setSelected(null);
    setShowDiscovery(true);
    try {
      const d = await api.enrichPlace(p);
      setSelected(d);
    } catch {
      setSelected({ ...p, reviews: [] });
    }
  };

  const navigate = (p: PlaceResult) => {
    setDest({ lat: p.lat, lng: p.lng, name: p.name });
    setMode("atob");
  };

  if (searching) {
    return (
      <div className="skeleton-list" aria-busy="true" aria-label="Loading results">
        {Array.from({ length: 3 }).map((_, i) => (
          <motion.div
            key={i}
            className="skeleton card-skel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.25, ease: EASE }}
          />
        ))}
      </div>
    );
  }

  if (!searched) return null; // idle: nothing was searched yet — no placeholder box

  if (searchResults.length === 0) {
    return (
      <motion.div
        className="results-empty"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        <motion.span
          className="empty-icon material-symbols-outlined"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.1 }}
        >search_off</motion.span>
        <div className="small">No places found at {radiusKm} km.</div>
        <button
          className="btn ghost small mt8"
          onClick={() => { setRadiusKm(Math.min(RANGE_MAX, radiusKm + 3)); window.dispatchEvent(new CustomEvent(RERUN_EVENT)); }}
        >
          <span className="material-symbols-outlined">zoom_out_map</span> Widen search radius
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div className="results" layout>
      {searchResults.map((p, i) => (
        <PlaceCard key={p.place_id || i} place={p} index={i} onPick={pickPlace} onDetails={openDetails} onNavigate={navigate} />
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------- input window
export default function SearchInput() {
  const { userLoc, setPlaces, setSearchResults, setNearbyBase, pinned, setPinned, clearTransient,
    setSearching, setSearched, radiusKm, setRadiusKm } = useApp();
  const [tab, setTab] = useState<"specific" | "nearby">("specific");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cats, setCats] = useState<Set<string>>(() => new Set(["Restaurant"]));
  const [cta, setCta] = useState<"idle" | "loading" | "done">("idle");
  const [idlePulse, setIdlePulse] = useState(false);
  const interactedRef = useRef(false);
  const chipsAnimatedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // ambient attention pulse on the CTA: 8s idle → subtle breathing glow, once per session
  useEffect(() => {
    if (tab !== "nearby" || interactedRef.current) return;
    const id = setTimeout(() => setIdlePulse(true), 8000);
    return () => clearTimeout(id);
  }, [tab]);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); return; }
    abortRef.current?.abort();
    const c = new AbortController();
    abortRef.current = c;
    try {
      const r = await api.searchPlaces(q, userLoc?.lat, userLoc?.lng, c.signal);
      setSuggestions(r.slice(0, 5));
      setActiveIdx(-1);
    } catch { /* aborted */ }
  }, [userLoc]);

  useEffect(() => {
    const id = setTimeout(() => fetchSuggestions(query), 300);
    return () => clearTimeout(id);
  }, [query, fetchSuggestions]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const switchTab = useCallback((t: "specific" | "nearby") => {
    if (t === tab) return;
    clearTransient();
    setTab(t);
  }, [tab, clearTransient]);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    clearTransient();
    setSuggestions([]);
    setActiveIdx(-1);
    setLoading(true);
    setSearching(true);
    setSearched(true);
    try {
      const r = await api.searchPlaces(q, userLoc?.lat, userLoc?.lng);
      setSearchResults(r);
      setPlaces(r);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  const clearQuery = () => {
    setQuery("");
    setSuggestions([]);
    clearTransient();
  };

  const runNearby = async () => {
    if (cats.size === 0) return;
    interactedRef.current = true;
    setIdlePulse(false);
    const base = pinned ?? (userLoc ? { lat: userLoc.lat, lng: userLoc.lng } : { lat: 12.9716, lng: 77.5946 });
    setNearbyBase({ lat: base.lat, lng: base.lng, radiusM: radiusKm * 1000 });
    setCta("loading");
    setSearching(true);
    setSearched(true);
    try {
      const r = await api.searchNearby(base.lat, base.lng, radiusKm * 1000, [...cats]);
      setSearchResults(r);
      setPlaces(r);
      setCta("done");
      setTimeout(() => setCta("idle"), 1500);
    } finally {
      setSearching(false);
    }
  };
  const runNearbyRef = useRef(runNearby);
  runNearbyRef.current = runNearby;

  // "Widen search radius" from the empty state (results window) re-triggers us
  useEffect(() => {
    const onRerun = () => {
      if (tab === "nearby") {
        runNearbyRef.current();
      } else {
        switchTab("nearby");
        setTimeout(() => runNearbyRef.current(), 380);
      }
    };
    window.addEventListener(RERUN_EVENT, onRerun);
    return () => window.removeEventListener(RERUN_EVENT, onRerun);
  }, [tab, switchTab]);

  const toggleCategory = (c: string, e: React.PointerEvent) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
    spawnRipple(e.currentTarget, e.clientX, e.clientY);
  };

  // short-lived ripple burst from the tap point (~250ms), then GC'd
  const spawnRipple = (el: HTMLElement, x: number, y: number) => {
    const rect = el.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "chip-ripple";
    ripple.style.left = `${x - rect.left}px`;
    ripple.style.top = `${y - rect.top}px`;
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 350);
  };

  // push a live circle to the map at animation-frame rate while dragging the slider
  const onRadiusChange = (v: number) => {
    setRadiusKm(v);
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const base = pinned ?? (userLoc ? { lat: userLoc.lat, lng: userLoc.lng } : { lat: 12.9716, lng: 77.5946 });
      setNearbyBase({ lat: base.lat, lng: base.lng, radiusM: v * 1000 });
    });
  };

  const pct = ((radiusKm - RANGE_MIN) / (RANGE_MAX - RANGE_MIN)) * 100;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) {
      if (e.key === "Enter") runSearch(query);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0) {
        const s = suggestions[activeIdx];
        setQuery(s.name);
        runSearch(s.name);
      } else {
        runSearch(query);
      }
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setActiveIdx(-1);
    }
  };

  const pickSuggestion = (s: PlaceResult) => {
    setQuery(s.name);
    runSearch(s.name);
  };

  const catCount = useMemo(() => cats.size, [cats]);

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="search-panel" layout transition={{ duration: 0.3, ease: EASE }}>
        <div className="seg" role="tablist" aria-label="Search mode">
          {(["specific", "nearby"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`seg-btn ${tab === t ? "active" : ""}`}
              onClick={() => switchTab(t)}
            >
              {tab === t && (
                <motion.span
                  layoutId="seg-pill"
                  className="seg-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="seg-label">{t === "specific" ? "Search" : "Nearby"}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {tab === "specific" ? (
            <motion.div
              key="specific"
              className="tab-view specific"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: EASE }}
              layout
            >
              <div className="search-box">
                <input
                  className="text-input"
                  placeholder="Search place or location…"
                  value={query}
                  onChange={(e) => { clearTransient(); setQuery(e.target.value); }}
                  onKeyDown={onKeyDown}
                  aria-label="Search place or location"
                  aria-expanded={suggestions.length > 0}
                  aria-activedescendant={activeIdx >= 0 ? `sug-${activeIdx}` : undefined}
                  autoComplete="off"
                />
                <button
                  className="btn search-btn"
                  onClick={() => (query ? clearQuery() : runSearch(query))}
                  aria-label={query ? "Clear search" : "Search"}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {loading ? (
                      <motion.span key="spin" className="spinner inline"
                        initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.18, ease: EASE }} />
                    ) : query ? (
                      <motion.span key="x" className="material-symbols-outlined"
                        initial={{ opacity: 0, scale: 0.5, rotate: -60 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ type: "spring", stiffness: 500, damping: 28 }}>close</motion.span>
                    ) : (
                      <motion.span key="search" className="material-symbols-outlined"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ duration: 0.15, ease: EASE }}>search</motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>

              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div
                    key="suggest"
                    className="suggest glass-strong"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.18, ease: EASE }}
                    ref={listRef}
                    role="listbox"
                  >
                    {suggestions.map((s, i) => (
                      <motion.button
                        key={s.place_id}
                        id={`sug-${i}`}
                        role="option"
                        aria-selected={activeIdx === i}
                        className={`suggest-item ${activeIdx === i ? "active" : ""}`}
                        onClick={() => pickSuggestion(s)}
                        onMouseEnter={() => setActiveIdx(i)}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.035, duration: 0.2, ease: EASE }}
                      >
                        <span className="material-symbols-outlined">location_on</span>
                        <span>
                          <b>{highlight(s.name, query)}</b>
                          <div className="muted small truncate">{s.address}</div>
                        </span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="nearby"
              className="tab-view nearby"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: EASE }}
              layout
            >
              {pinned && (
                <div className="pinned-banner glass anim-in">
                  <span className="row">
                    <span className="material-symbols-outlined">push_pin</span>
                    <span className="truncate">Near {pinned.name}</span>
                  </span>
                  <button className="btn ghost small" onClick={() => setPinned(null)}>Clear</button>
                </div>
              )}

              <div className="chips-row" role="group" aria-label="Categories">
                {NEARBY_CATEGORIES.map((c, i) => {
                  const selected = cats.has(c);
                  const firstRun = !chipsAnimatedRef.current;
                  if (firstRun && i === NEARBY_CATEGORIES.length - 1) chipsAnimatedRef.current = true;
                  return (
                    <motion.button
                      key={c}
                      className={`chip ${selected ? "active" : ""}`}
                      onClick={(e) => toggleCategory(c, e)}
                      whileTap={{ scale: 0.93 }}
                      initial={firstRun ? { opacity: 0, y: 8 } : false}
                      animate={firstRun
                        ? { opacity: 1, y: 0, scale: 1 }
                        : selected ? { scale: [0.9, 1.08, 1] } : { scale: 1 }}
                      transition={{ delay: firstRun ? i * 0.05 : 0, duration: 0.35, ease: EASE }}
                      aria-pressed={selected}
                    >
                      <span className="chip-icon material-symbols-outlined">{CATEGORY_ICONS[c]}</span>
                      <span>{c}</span>
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            className="chip-check"
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 600, damping: 26 }}
                          >✓</motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>

              <div className="chip-count muted small">
                {catCount > 0 ? `${catCount} selected` : "Pick at least one category"}
              </div>

              <div className="radius">
                <div className="spread">
                  <span className="muted small">Radius</span>
                  <span className="small">{radiusKm} km</span>
                </div>
                <div className="slider-wrap">
                  <div className="slider-ticks">
                    {SNAP_POINTS.map((t) => (
                      <span key={t} className="tick" style={{ left: `${((t - RANGE_MIN) / (RANGE_MAX - RANGE_MIN)) * 100}%` }} />
                    ))}
                  </div>
                  <input
                    type="range"
                    min={RANGE_MIN}
                    max={RANGE_MAX}
                    step={0.5}
                    value={radiusKm}
                    onChange={(e) => onRadiusChange(Number(e.target.value))}
                    onPointerDown={() => setDragging(true)}
                    onPointerUp={() => setDragging(false)}
                    onPointerLeave={() => setDragging(false)}
                    className={`radius-range ${dragging ? "dragging" : ""}`}
                    style={{ background: `linear-gradient(90deg, var(--primary) ${pct}%, rgba(120,130,160,0.25) ${pct}%)` }}
                    aria-label="Nearby search radius"
                  />
                  <AnimatePresence>
                    {(dragging) && (
                      <motion.div
                        className="slider-tip"
                        style={{ left: `${pct}%` }}
                        initial={{ opacity: 0, y: 6, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      >
                        {radiusKm} km
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <motion.button
                className={`btn full mt8 cta ${idlePulse ? "cta-idle" : ""}`}
                onClick={runNearby}
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02, boxShadow: "0 0 0 1px var(--primary), 0 8px 28px rgba(108,92,231,0.45)" }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                disabled={catCount === 0}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {cta === "loading" ? (
                    <motion.span key="load" className="row"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, ease: EASE }}>
                      <span className="spinner inline light" /> Finding…
                    </motion.span>
                  ) : cta === "done" ? (
                    <motion.span key="ok" className="row"
                      initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ type: "spring", stiffness: 500, damping: 26 }}>
                      <span className="material-symbols-outlined">check_circle</span> Found
                    </motion.span>
                  ) : (
                    <motion.span key="idle" className="row"
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, ease: EASE }}>
                      <span className="material-symbols-outlined">near_me</span> Find nearby
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}
