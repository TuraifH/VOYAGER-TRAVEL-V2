import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useApp, type Mode } from "../context/AppContext";
import HeaderBar from "../components/HeaderBar";
import MapView from "../components/MapView";
import SearchInput, { SearchResults } from "../components/SearchPanel";
import AToBInput, { AtoBResults, QuickSuggestionResults } from "../components/AToBPanel";
import TripInput, { TripResults } from "../components/TripPanel";
import DiscoveryPanel from "../components/DiscoveryPanel";
import NewsPopup from "../components/NewsPopup";
import SegmentFlowView from "../components/SegmentFlowView";
import "./MainPage.css";

const TABS: { key: Mode; label: string; icon: string }[] = [
  { key: "search", label: "Search", icon: "search" },
  { key: "atob", label: "A→B", icon: "directions" },
  { key: "trip", label: "Trip", icon: "luggage" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export default function MainPage() {
  const { mode, setMode, clearTransient, setUserLoc, flowOpen, setFlowOpen, flowParams,
    searched, searching, searchResults } = useApp();

  const [flowH, setFlowH] = useState(38); // % of map-wrap height
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  // Search/Nearby results window only exists once a search was actually run
  // (or is running) — no placeholder box floating on the idle view.
  const searchHasContent = searching || searched || searchResults.length > 0;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = flowH;
    dragRef.current = { startY, startH };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY; // drag up grows panel
      const newH = Math.min(75, Math.max(20, dragRef.current.startH + (delta / window.innerHeight) * 100));
      setFlowH(newH);
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const changeMode = (m: Mode) => {
    if (m === mode) return;
    clearTransient();
    setMode(m);
  };

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLoc({ lat: 12.9716, lng: 77.5946, name: "Bengaluru" }),
      { timeout: 6000 },
    );
  }, [setUserLoc]);

  return (
    <div className="app-shell">
      <HeaderBar />
      <div className="app-body">
        <motion.aside
          className="input-window glass-strong"
          layout
          transition={{ duration: 0.35, ease: EASE }}
        >
          {mode === "search" && <SearchInput />}
          {mode === "atob" && <AToBInput />}
          {mode === "trip" && <TripInput />}
        </motion.aside>

        {!(mode === "search" && !searchHasContent) && (
          <motion.aside
            className="results-window glass-strong"
            layout
            transition={{ duration: 0.35, ease: EASE }}
          >
            {mode === "search" && <SearchResults />}
            {mode === "atob" && <AtoBResults />}
            {mode === "atob" && <QuickSuggestionResults />}
            {mode === "trip" && <TripResults />}
          </motion.aside>
        )}

        <main className="map-wrap">
          <MapView />
          {flowOpen && (
            <section className="flow-sheet glass-strong" style={{ height: `${flowH}%` }}>
              <div className="resize-handle" onMouseDown={startResize} title="Drag to resize">
                <span className="resize-dot" />
              </div>
              <div className="flow-sheet-head">
                <span className="row">
                  <span className="material-symbols-outlined">route</span>
                  <b>Build your route</b>
                </span>
                <button className="icon-btn" onClick={() => setFlowOpen(false)} title="Close">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <SegmentFlowView groupSize={flowParams.groupSize} budget={flowParams.budget} />
            </section>
          )}
        </main>

        <NewsPopup />

        <DiscoveryPanel />
      </div>

      <nav className="bottom-nav glass-strong">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${mode === t.key ? "active" : ""}`}
            onClick={() => changeMode(t.key)}
          >
            <span className="material-symbols-outlined">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}