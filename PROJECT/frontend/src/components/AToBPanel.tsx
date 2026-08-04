import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import type { LatLng, PlaceResult, RidePrice } from "../types";
import "./AToBPanel.css";

type SubMode = "transit" | "ride" | "drive" | "walk";
type TravelMode = "public" | "drive" | "walk";

function Autocomplete({ label, color, value, onPick, onType }: {
  label: string; color: string; value: string;
  onPick: (name: string, p: LatLng) => void;
  onType: () => void;
}) {
  const { userLoc } = useApp();
  const [q, setQ] = useState(value);
  const [sugg, setSugg] = useState<PlaceResult[]>([]);

  useEffect(() => { setQ(value); }, [value]);

  const pickCurrentLocation = () => {
    if (!userLoc) return;
    onPick(userLoc.name ?? "Current location", userLoc);
    setQ(userLoc.name ?? "Current location");
    setSugg([]);
  };

  useEffect(() => {
    if (q.trim().length < 2) { setSugg([]); return; }
    const id = setTimeout(async () => {
      try {
        const r = await api.searchPlaces(q, userLoc?.lat, userLoc?.lng);
        setSugg(r.slice(0, 5));
      } catch { setSugg([]); }
    }, 300);
    return () => clearTimeout(id);
  }, [q, userLoc]);

  return (
    <div className="auto">
      <span className="auto-dot" style={{ background: color }} />
      <input
        className="text-input"
        placeholder={label}
        value={q}
        onChange={(e) => { setQ(e.target.value); onType(); }}
      />
      <button className="locate-btn" onClick={pickCurrentLocation} title="Use current location">
        <span className="material-symbols-outlined">my_location</span>
      </button>
      {sugg.length > 0 && (
        <div className="suggest glass-strong">
          <button className="suggest-item" onClick={() => {
            if (userLoc) onPick(q, userLoc); setSugg([]);
          }}>
            <span className="material-symbols-outlined">my_location</span> Current location
          </button>
          {sugg.map((s) => (
            <button key={s.place_id} className="suggest-item" onClick={() => {
              onPick(s.name, { lat: s.lat, lng: s.lng, name: s.name });
              setQ(s.name); setSugg([]);
            }}>
              <span className="material-symbols-outlined">location_on</span>
              <span><b>{s.name}</b><div className="muted small">{s.address}</div></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RideCard({ p, onSelect }: { p: RidePrice; onSelect: (p: RidePrice) => void }) {
  return (
    <button className="ride-card glass hover-lift anim-up" onClick={() => onSelect(p)}>
      <div className="spread">
        <span className="row">
          <span className="material-symbols-outlined">local_taxi</span>
          <b>{p.provider}</b>
          <span className="muted small">{p.mode}</span>
        </span>
        <span className={`badge ${p.source === "live" ? "live" : "est"}`}>{p.source === "live" ? "LIVE" : "ESTIMATED"}</span>
      </div>
      <div className="spread mt8">
        <span className="price">₹{p.total.toFixed(0)}</span>
        <span className="muted small">{p.per_person.toFixed(0)}/person{p.eta_min ? ` • ${p.eta_min} min` : ""}</span>
      </div>
      {p.note && <div className="muted small mt8">{p.note}</div>}
    </button>
  );
}

// ---------------------------------------------------------------- results window
export function AtoBResults() {
  const { source, dest, prices, fuel, setFlyTo, setRidePath } = useApp();

  const selectRide = async (_p: RidePrice) => {
    if (!source || !dest) return;
    setFlyTo(dest);
    try {
      const route = await api.driveRoute(source, dest);
      setRidePath((route.geometry ?? []).map((pt) => [Number(pt[0]), Number(pt[1])]));
    } catch {
      setRidePath(null);
    }
  };

  const hasAny = (prices?.length ?? 0) > 0 || fuel != null;
  if (!hasAny) {
    return <div className="results-empty muted small">Ride prices and fuel estimates will appear here.</div>;
  }

  return (
    <div className="rides">
      {fuel != null && (
        <div className="fuel-card glass anim-in">
          <span className="row"><span className="material-symbols-outlined">local_gas_station</span>
            <b>Fuel cost: ₹{fuel}</b></span>
          <div className="muted small">At ₹110/L — approximate</div>
        </div>
      )}
      {prices.map((p, i) => <RideCard key={i} p={p} onSelect={selectRide} />)}
    </div>
  );
}

// ---------------------------------------------------------------- input window
export default function AtoBInput() {
  const { source, dest, setSource, setDest, swap, setFlyTo, setPlaces, setRidePath,
          setFlowOpen, setFlowParams, setPrices, setFuel, clearTransient } = useApp();
  const setResults = ({ fuel }: { fuel?: number | null }) => setFuel(fuel ?? null);
  const [travelMode, setTravelMode] = useState<TravelMode>("public");
  const [subMode, setSubMode] = useState<SubMode>("transit");
  const [srcName, setSrcName] = useState("");
  const [dstName, setDstName] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [budget, setBudget] = useState(500);
  const [mileage, setMileage] = useState(15);
  const [loading, setLoading] = useState(false);

  const pickSource = (name: string, p: LatLng) => { clearTransient(); setSource(p); setSrcName(name); };
  const pickDest = (name: string, p: LatLng) => { clearTransient(); setDest(p); setDstName(name); setFlyTo(p); };

  useEffect(() => {
    if (source) setSrcName(source.name ?? "");
  }, [source]);
  useEffect(() => {
    if (dest) setDstName(dest.name ?? "");
  }, [dest]);

  const findRoutes = async () => {
    if (!source || !dest) return;
    setLoading(true);
    setPlaces([]);
    setFlowParams({ groupSize, budget });
    try {
      if (travelMode === "public" && subMode === "ride") {
        const p = await api.ridePrices(source, dest, groupSize);
        setPrices(p);
        setFlowOpen(false);
      } else if (travelMode === "public" && subMode === "transit") {
        setFlowOpen(true);   // hop window = bottom sheet over the map
      } else {
        setFlowOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const startDrive = async () => {
    if (!source || !dest) return;
    setLoading(true);
    clearTransient();
    try {
      const route = await api.driveRoute(source, dest);
      setRidePath((route.geometry ?? []).map((pt) => [Number(pt[0]), Number(pt[1])]));
      const distKm = (route.distance_m ?? 0) / 1000;
      const fuelPerLiter = route.fuel_price_per_liter ?? 110.0;
      const fuel = (fuelPerLiter * distKm) / mileage;
      setResults({ fuel: Math.round(fuel * 100) / 100 });
    } catch {
      setRidePath(null);
      setFuel(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="atob-panel">
      <div className="mode-tabs row">
        {(["public", "drive", "walk"] as TravelMode[]).map((m) => (
          <button key={m} className={`chip ${travelMode === m ? "active" : ""}`} onClick={() => setTravelMode(m)}>
            {m === "public" ? "Public" : m === "drive" ? "Drive" : "Walk"}
          </button>
        ))}
      </div>

      {travelMode === "public" && (
        <div className="sub-mode row">
          <button className={`chip ${subMode === "transit" ? "active" : ""}`} onClick={() => setSubMode("transit")}>Multi-hop transit</button>
          <button className={`chip ${subMode === "ride" ? "active" : ""}`} onClick={() => setSubMode("ride")}>Direct ride</button>
        </div>
      )}

      <div className="inputs">
        <Autocomplete label="Source" color="#27ae60" value={srcName} onPick={pickSource} onType={clearTransient} />
        <div className="swap-row">
          <span className="connector" />
          <button className="swap-btn" onClick={swap} title="Swap"><span className="material-symbols-outlined">swap_vert</span></button>
        </div>
        <Autocomplete label="Destination" color="#eb5757" value={dstName} onPick={pickDest} onType={clearTransient} />
      </div>

      <div className="params row">
        <label className="param">
          <span className="muted small">Group</span>
          <input type="number" min={1} max={20} className="text-input" value={groupSize} onChange={(e) => setGroupSize(Math.max(1, Number(e.target.value)))} />
        </label>
        <label className="param">
          <span className="muted small">Budget ₹</span>
          <input type="number" min={0} className="text-input" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </label>
        {travelMode === "drive" && (
          <label className="param">
            <span className="muted small">Mileage km/L</span>
            <input type="number" min={5} max={40} className="text-input" value={mileage} onChange={(e) => setMileage(Number(e.target.value))} />
          </label>
        )}
      </div>

      <button className="btn full mt8" onClick={travelMode === "drive" ? startDrive : findRoutes} disabled={!source || !dest || loading}>
        {loading ? <span className="spinner inline" /> : <span className="material-symbols-outlined">route</span>}
        {travelMode === "drive" ? "Estimate drive" : subMode === "ride" ? "Get ride prices" : "Find routes"}
      </button>
    </div>
  );
}