import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import type { HopOption, Segment, SegmentResponse } from "../types";
import "./SegmentFlowView.css";

const MODE_META: Record<string, { icon: string; color: string; label: string }> = {
  bus: { icon: "directions_bus", color: "#6c5ce7", label: "Bus" },
  metro: { icon: "subway", color: "#00cec9", label: "Metro" },
  train: { icon: "train", color: "#e17055", label: "Train" },
  walk: { icon: "directions_walk", color: "#95a5a6", label: "Walk" },
  ride: { icon: "local_taxi", color: "#f39c12", label: "Cab" },
};

function legColor(mode: string): string {
  return MODE_META[mode]?.color ?? "#6c5ce7";
}

const MAX_VISIBLE = 10;
const CATCH_BUFFER_MIN = 4; // catch-the-bus buffer (PROMPT_3 §3.2)

function timeToMin(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function dedupeOptions(options: HopOption[]): HopOption[] {
  const seen = new Set<string>();
  const out: HopOption[] = [];
  for (const o of options) {
    const key = `${o.mode}|${o.routeNumber ?? ""}|${(o.destinationStop?.name ?? "").toLowerCase()}|${o.departureTime ?? ""}|${o.fromStop?.name ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  const rankMode = (m?: string) => (m === "bus" || m === "metro" || m === "train" ? 1 : 0);
  out.sort((a, b) => {
    const ta = Number(b.isTopRecommended ?? false) - Number(a.isTopRecommended ?? false);
    if (ta !== 0) return ta;
    return rankMode(b.mode) - rankMode(a.mode);
  });
  return out;
}

// client-side filter for a hop column: options must connect from the previously
// chosen stop and depart after its arrival + catch buffer (PROMPT_3 §T3)
function optionsForLevel(seg: Segment | undefined, confirmedUpTo: HopOption[], idx: number): HopOption[] {
  if (!seg) return [];
  const prev = idx > 0 ? confirmedUpTo[idx - 1] : null;
  const prevStop = prev?.destinationStop?.name?.toLowerCase();
  const prevArr = timeToMin(prev?.arrivalTime);
  let opts = seg.options ?? [];
  if (prevStop) {
    opts = opts.filter((o) => {
      const cf = o.connectedFrom?.toLowerCase();
      if (cf && cf !== prevStop) return false;
      if (prevArr != null) {
        const d = timeToMin(o.departureTime);
        if (d != null && d < prevArr + CATCH_BUFFER_MIN) return false;
      }
      return true;
    });
  }
  return dedupeOptions(opts).slice(0, MAX_VISIBLE);
}

export default function SegmentFlowView({ groupSize, budget }: { groupSize?: number; budget?: number }) {
  const gs = groupSize ?? 1;
  const bg = budget ?? 500;
  const { source, dest, journey, setJourney, setFlyTo } = useApp();
  const [levels, setLevels] = useState<Segment[]>(journey.segments?.segments ?? []);
  const [confirmed, setConfirmed] = useState<HopOption[]>(journey.chosenLegs as HopOption[]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(journey.segments?.journeyComplete ?? false);
  const [warnings, setWarnings] = useState<string[]>(journey.segments?.warnings ?? []);

  const loadInitial = async () => {
    if (!source || !dest) return;
    setLoading(true);
    try {
      const r = await api.routeSegments(source, dest, gs, bg);
      setLevels(r.segments ?? []);
      setComplete(!!r.journeyComplete);
      setWarnings(r.warnings ?? []);
      setJourney({ segments: r, chosenLegs: [] });
    } finally {
      setLoading(false);
    }
  };

  useMemo(() => {
    if (!journey.segments?.segments?.length) loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectHop = async (idx: number, opt: HopOption) => {
    const nextConfirmed = [...confirmed.slice(0, idx), opt];
    setConfirmed(nextConfirmed);
    setJourney({ chosenLegs: nextConfirmed });

    // geometry is [lat, lng] — fly to the real end of the leg (never swapped)
    if (opt.geometry?.length) {
      const lastPt = opt.geometry[opt.geometry.length - 1];
      setFlyTo({ lat: Number(lastPt[0]), lng: Number(lastPt[1]) });
    }

    const nextIdx = idx + 1;
    const prefetched = levels[nextIdx];
    const prefetchCount = optionsForLevel(prefetched, nextConfirmed, nextIdx).length;
    if (prefetched && prefetchCount > 0) {
      // fast client-side advance (pre-fetched segment, PROMPT_3 §T3)
      setCurrentIdx(nextIdx);
      return;
    }

    // deeper hop or stale prefetch → time-chained fetch from the server
    setLoading(true);
    try {
      const r: SegmentResponse = await api.segmentNext(journey.segments?.journey ?? {}, nextConfirmed, gs, bg);
      const newLevels = [...levels.slice(0, nextIdx), ...(r.segments ?? [])];
      setLevels(newLevels);
      setComplete(!!r.journeyComplete);
      if (r.warnings?.length) setWarnings(r.warnings);
      setCurrentIdx(nextIdx);
      setJourney({
        segments: { ...(journey.segments ?? {}), segments: newLevels } as SegmentResponse,
        chosenLegs: nextConfirmed,
      });
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    const prevIdx = Math.max(0, currentIdx - 1);
    setCurrentIdx(prevIdx);
    setConfirmed(confirmed.slice(0, prevIdx));
    setJourney({ chosenLegs: confirmed.slice(0, prevIdx) });
    setLevels(levels.slice(0, prevIdx + 1));
    setComplete(false);
  };

  const reset = () => {
    setConfirmed([]);
    setCurrentIdx(0);
    setComplete(false);
    setWarnings([]);
    setJourney({ chosenLegs: [] });
    loadInitial();
  };

  const seg = levels[currentIdx];
  const shown = optionsForLevel(seg, confirmed, currentIdx);
  const totalCount = seg?.options?.length ?? 0;

  const breadcrumb = useMemo(() => {
    const items: { label: string; mode?: string }[] = [];
    if (source) items.push({ label: source.name || "Source" });
    confirmed.forEach((c) => {
      items.push({ label: `${c.routeNumber ?? ""} ${c.mode ?? ""}`.trim(), mode: c.mode });
      items.push({ label: c.destinationStop?.name ?? "…" });
    });
    if (dest && !complete) items.push({ label: dest.name || "Destination", mode: "walk" });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, dest, confirmed, complete]);

  const totalTime = useMemo(() => confirmed.reduce((a, c) => a + (c.durationMin ?? 0), 0), [confirmed]);
  const totalFare = useMemo(() => confirmed.reduce((a, c) => a + (c.fare ?? 0), 0), [confirmed]);

  return (
    <div className="flow-view">
      <div className="breadcrumb glass">
        {breadcrumb.map((b, i) => (
          <span key={i} className="crumb row">
            <span className="crumb-dot" style={{ background: b.mode ? legColor(b.mode) : undefined }} />
            <span className={`truncate ${i % 2 === 1 ? "crumb-route" : ""}`}>{b.label}</span>
            {i < breadcrumb.length - 1 && <span className="muted">›</span>}
          </span>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="warn-strip glass">
          {warnings.map((w, i) => (
            <div key={i} className="small"><span className="material-symbols-outlined">warning</span> {w}</div>
          ))}
        </div>
      )}

      {complete && confirmed.length > 0 ? (
        <div className="complete glass-strong anim-scale">
          <div className="row">
            <span className="material-symbols-outlined done">check_circle</span>
            <h3>You reached {dest?.name ?? "destination"}!</h3>
          </div>
          <div className="row mt8">
            <span className="stat"><b>{totalTime}</b> min</span>
            <span className="stat"><b>₹{totalFare}</b> total</span>
            <span className="stat"><b>{confirmed.length}</b> legs</span>
          </div>
          <button className="btn ghost mt12" onClick={reset}>Reset journey</button>
        </div>
      ) : (
        <div className="hop-col">
          <div className="col-head">
            Hop {currentIdx + 1}
            {seg?.title && <span className="muted small"> — {seg.title}</span>}
            <span className="muted small">({totalCount} options)</span>
          </div>

          <div className="hop-list">
            {shown.map((opt, oi) => {
              const meta = MODE_META[opt.mode ?? ""] ?? MODE_META.bus;
              const selected = confirmed[currentIdx]?.optionId === opt.optionId;
              const best = opt.isTopRecommended;
              return (
                <button
                  key={opt.optionId || oi}
                  className={`hop-card glass hover-lift ${selected ? "selected" : ""} ${opt.mode === "walk" ? "walk" : ""}`}
                  style={{ borderLeftColor: meta.color }}
                  onClick={() => selectHop(currentIdx, opt)}
                  onMouseEnter={() => {
                    if (opt.geometry?.length) {
                      const lastPt = opt.geometry[opt.geometry.length - 1];
                      setFlyTo({ lat: Number(lastPt[0]), lng: Number(lastPt[1]) });
                    }
                  }}
                >
                  <div className="spread">
                    <span className="row">
                      <span className="material-symbols-outlined" style={{ color: meta.color }}>{meta.icon}</span>
                      <b>{opt.mode === "walk" ? "Walk" : opt.routeNumber ?? meta.label}</b>
                    </span>
                    {best && <span className="badge gold">★ Top</span>}
                  </div>
                  <div className="small truncate mt4">
                    → {opt.destinationStop?.name}
                  </div>
                  <div className="spread mt8">
                    <span className="small">{opt.durationMin ?? "—"} min</span>
                    {opt.distanceKm != null && opt.distanceKm > 0 && (
                      <span className="small muted">{opt.distanceKm.toFixed(1)} km</span>
                    )}
                  </div>
                  <div className="spread">
                    {opt.departureTime && <span className="muted small">⏱ {opt.departureTime}</span>}
                    <span className="small">{opt.fare != null ? `₹${opt.fare}` : opt.mode === "walk" ? "Free" : "—"}</span>
                  </div>
                  {opt.transitOptionsFromThisStop != null && (
                    <div className="muted small mt4">↻ {opt.transitOptionsFromThisStop} onward options</div>
                  )}
                </button>
              );
            })}
            {loading && <div className="skeleton hop-skel" />}
            {!loading && shown.length === 0 && (
              <div className="muted small mt8">No onward options from this stop before the catch window.</div>
            )}
          </div>

          {confirmed.length > 0 && (
            <div className="row mt8 gap">
              <button className="btn ghost" onClick={goBack}>‹ Undo hop</button>
              <button className="btn ghost" onClick={reset}>Reset</button>
              <button className="btn full" onClick={() => setJourney({ active: true })}>
                <span className="material-symbols-outlined">navigation</span> Start journey
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
