import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import type { HopOption, Segment, SegmentResponse } from "../types";
import HopTreeView, { optionsForLevel } from "./HopTreeView";
import "./SegmentFlowView.css";

const legColor = (mode: string) =>
  ({ bus: "#6c5ce7", metro: "#00cec9", train: "#e17055", walk: "#95a5a6", ride: "#f39c12" }[mode] ?? "#6c5ce7");

export default function SegmentFlowView({ groupSize, budget }: { groupSize?: number; budget?: number }) {
  const gs = groupSize ?? 1;
  const bg = budget ?? 500;
  const { source, dest, journey, setJourney, setFlyTo } = useApp();
  const [levels, setLevels] = useState<Segment[]>(journey.segments?.segments ?? []);
  const [confirmed, setConfirmed] = useState<HopOption[]>(journey.chosenLegs as HopOption[]);
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
      setJourney({
        segments: { ...(journey.segments ?? {}), segments: newLevels } as SegmentResponse,
        chosenLegs: nextConfirmed,
      });
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setConfirmed(confirmed.slice(0, -1));
    setJourney({ chosenLegs: confirmed.slice(0, -1) });
    setComplete(false);
  };

  const reset = () => {
    setConfirmed([]);
    setComplete(false);
    setWarnings([]);
    setJourney({ chosenLegs: [] });
    loadInitial();
  };

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
  const perPersonFare = useMemo(() => confirmed.reduce((a, c) => a + (c.perPersonFare ?? c.fare ?? 0), 0), [confirmed]);
  const groupFare = gs * perPersonFare;
  const fareLabel = perPersonFare > 0
    ? (gs > 1 ? `₹${get(perPersonFare)}/person · ₹${get(groupFare)} total` : `₹${get(perPersonFare)}`)
    : null;

  function get(v: number) { return Math.round(v * 100) / 100; }

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

      {confirmed.length > 0 && (
        <div className="cost-strip glass">
          <span className="stat">
            <b>{totalTime}</b> min
            <span className="muted small"> (time)</span>
          </span>
          {fareLabel ? (
            <span className="stat"><b>{fareLabel}</b></span>
          ) : (
            <span className="stat muted small">cost unavailable</span>
          )}
          <span className="stat muted small"><b>{confirmed.length}</b> leg{confirmed.length > 1 ? "s" : ""}</span>
          {perPersonFare > 0 && gs > 1 && (
            <span className="stat">×<b>{gs}</b> travellers</span>
          )}
        </div>
      )}

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
        <HopTreeView
          levels={levels}
          confirmed={confirmed}
          source={source}
          dest={dest}
          complete={complete}
          loading={loading}
          onSelect={selectHop}
        />
      )}

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
  );
}