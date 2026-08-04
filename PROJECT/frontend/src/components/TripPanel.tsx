import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { api, type TripPlanRequest } from "../services/api";
import type { GroupType, Pace, PlaceResult, TripInputData, TripPlacePick, BudgetSplits, TripPlan } from "../types";
import "./TripPanel.css";

// ------------------------------------------------------------------ static option sets
const INTERESTS = [
  "Beaches", "Temples", "Food", "Shopping", "Nature", "Adventure",
  "Historical", "Nightlife", "Museums", "Wildlife", "Family-friendly",
] as const;

const GROUP_TYPES: { key: GroupType; label: string; icon: string }[] = [
  { key: "solo", label: "Solo", icon: "person" },
  { key: "couple", label: "Couple", icon: "favorite" },
  { key: "friends", label: "Friends", icon: "groups" },
  { key: "family", label: "Family", icon: "family_restroom" },
  { key: "seniors", label: "Seniors", icon: "elderly" },
];

const PACES: { key: Pace; label: string; desc: string; icon: string }[] = [
  { key: "relaxed", label: "Relaxed", desc: "1–2 spots/day, slow", icon: "spa" },
  { key: "balanced", label: "Balanced", desc: "3–4 spots/day", icon: "balance" },
  { key: "packed", label: "Packed", desc: "5+ spots/day, fast", icon: "bolt" },
];

const AUTO_SPLITS: BudgetSplits = { stay: 35, food: 25, transport: 15, attractions: 20, misc: 5 };
const SPLIT_KEYS: (keyof BudgetSplits)[] = ["stay", "food", "transport", "attractions", "misc"];

const DEFAULT_DRAFT: TripInputData = {
  destination: null,
  suggestDestination: false,
  durationMode: "dates",
  startDate: null,
  endDate: null,
  days: 3,
  groupSize: 2,
  groupType: "friends",
  hasKids: false,
  budget: 10000,
  budgetShape: "total",
  budgetSplits: { ...AUTO_SPLITS },
  interests: [],
  pace: "balanced",
};

const STEP_TITLES = [
  "Where to?", "How long?", "Your group", "Budget", "Interests", "Pace", "Review & generate",
];

function daysBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!a || !b || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

// ------------------------------------------------------------------ destination autocomplete
function DestinationInput({ value, onPick }: { value: TripPlacePick | null; onPick: (p: TripPlacePick | null) => void }) {
  const { userLoc } = useApp();
  const [q, setQ] = useState(value?.name ?? "");
  const [sugg, setSugg] = useState<PlaceResult[]>([]);

  useEffect(() => { setQ(value?.name ?? ""); }, [value]);

  useEffect(() => {
    if (q.trim().length < 2) { setSugg([]); return; }
    const id = setTimeout(async () => {
      try { setSugg((await api.searchPlaces(q, userLoc?.lat, userLoc?.lng)).slice(0, 5)); }
      catch { setSugg([]); }
    }, 300);
    return () => clearTimeout(id);
  }, [q, userLoc]);

  return (
    <div className="auto">
      <span className="auto-dot" style={{ background: "var(--primary)" }} />
      <input
        className="text-input"
        placeholder="Search a city or region"
        value={q}
        onChange={(e) => { setQ(e.target.value); if (e.target.value !== value?.name) onPick(null); }}
      />
      {sugg.length > 0 && (
        <div className="suggest glass-strong">
          {sugg.map((s) => (
            <button key={s.place_id} className="suggest-item" onClick={() => {
              const pick: TripPlacePick = { name: s.name, lat: s.lat, lng: s.lng };
              onPick(pick); setQ(s.name); setSugg([]);
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

// ------------------------------------------------------------------ budget split sliders
function splitSum(s: BudgetSplits): number {
  return SPLIT_KEYS.reduce((sum, k) => sum + Math.round(s[k] || 0), 0);
}

function adjustSplit(prev: BudgetSplits, key: keyof BudgetSplits, value: number): BudgetSplits {
  const clamped = Math.max(0, Math.min(100, value));
  const others = SPLIT_KEYS.filter((k) => k !== key);
  const otherSum = SPLIT_KEYS.reduce((s, k) => (k === key ? s : s + (prev[k] || 0)), 0);
  const remaining = 100 - clamped;
  let next = { ...prev, [key]: clamped };
  const scale = otherSum > 0 ? remaining / otherSum : 0;
  others.forEach((k) => { next[k] = Math.round((prev[k] || 0) * scale); });
  const delta = 100 - (clamped + others.reduce((s, k) => s + next[k], 0));
  next[others[0]] = Math.max(0, (next[others[0]] || 0) + delta);
  return next;
}

const SPLIT_LABELS: Record<keyof BudgetSplits, string> = {
  stay: "Stay", food: "Food", transport: "Transport", attractions: "Attractions", misc: "Misc",
};

// ------------------------------------------------------------------ trip plan generation
const INTEREST_TO_TAG: Record<string, string> = {
  Beaches: "nature", Temples: "religious", Food: "food", Shopping: "shopping",
  Nature: "nature", Adventure: "adventure", Historical: "heritage",
  Nightlife: "nightlife", Museums: "museum", Wildlife: "nature",
};

function requestFromTrip(t: TripInputData): TripPlanRequest {
  const name = t.destination?.name ?? "";
  const slug = name.trim().toLowerCase().replace(/[^a-z]+/g, "") || "bengaluru";
  const tags = Array.from(new Set(
    t.interests.map((i) => INTEREST_TO_TAG[i]).filter(Boolean) as string[],
  ));
  let group = t.groupType === "seniors" ? "senior" : t.groupType;
  if (group === "family") group = t.hasKids ? "family_kids" : "family";
  const totalBudget = t.budgetShape === "perPerson" ? t.budget * t.groupSize : t.budget;
  return {
    destination: slug,
    interests: tags,
    group_type: group,
    days: Math.max(1, t.days),
    pace: t.pace,
    budget: totalBudget,
  };
}

function fmtMins(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

const CAT_ICON: Record<string, string> = {
  nature: "park", heritage: "account_balance", food: "restaurant",
  adventure: "attractions", shopping: "shopping_bag", nightlife: "local_bar",
  wellness: "spa", religious: "temple_hindu", museum: "museum", photo: "photo_camera",
};

function DayCard({ day }: { day: TripPlan["days"][number] }) {
  return (
    <div className="day-card glass">
      <div className="day-head">
        <span className="day-badge">Day {day.day}</span>
        <span className="muted small">{day.place_count} places • {fmtMins(day.total_activity_min)} sightseeing</span>
      </div>
      <ol className="day-places">
        {day.places.map((p, i) => (
          <li key={p.id} className="day-place">
            <span className="place-num">{i + 1}</span>
            <span className="place-cat material-symbols-outlined">{CAT_ICON[p.category] ?? "place"}</span>
            <span className="place-main">
              <span className="place-name">{p.name}</span>
              <span className="muted small">{p.why}</span>
              <span className="muted tiny">
                {fmtMins(p.duration_min)} • {p.entry_fee ? `₹${p.entry_fee} entry` : "free entry"}
                {p.opening_hours ? ` • ${p.opening_hours}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------ results window (generated itinerary)
export function TripResults() {
  const { trip } = useApp();
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tripRef, setTripRef] = useState<TripInputData | null>(null);

  const fetchPlan = useCallback(async (t: TripInputData) => {
    setLoading(true); setError(null); setTripRef(t);
    try {
      setPlan(await api.tripPlan(requestFromTrip(t)));
    } catch (e) {
      setPlan(null);
      setError(e instanceof Error ? e.message : "Could not generate the trip plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (trip) fetchPlan(trip);
  }, [trip, fetchPlan]);

  if (!trip) {
    return (
      <div className="trip-results">
        <div className="ai-insight glass">
          <div className="spread">
            <span className="row"><span className="material-symbols-outlined">auto_awesome</span><b>AI Trip Planner</b></span>
            <span className="badge live">READY</span>
          </div>
          <p className="small mt8">
            Answer 7 quick steps to build a full day-by-day itinerary with transport, budget and stays.
          </p>
        </div>
        <div className="section-head mt12">Generated Plan</div>
        <div className="empty glass">
          <span className="material-symbols-outlined">luggage</span>
          <div className="muted small">Nothing yet. Fill the form and hit "Generate My Trip".</div>
        </div>
      </div>
    );
  }

  const planIsForThisTrip = tripRef === trip;

  return (
    <div className="trip-results">
      <div className="trip-preview-card glass anim-in">
        <div className="spread">
          <span className="row"><span className="material-symbols-outlined">check_circle</span><b>Your plan</b></span>
          <span className="badge live">{planIsForThisTrip && plan ? "GENERATED" : "LOCKED"}</span>
        </div>
        <div className="muted small mt8">{trip.destination?.name ?? "Suggested destination"}</div>
        <div className="spread mt8">
          <b>{trip.days} day{trip.days === 1 ? "" : "s"}</b>
          <span className="muted small">{trip.groupSize} traveller{trip.groupSize === 1 ? "" : "s"} • {trip.pace} pace</span>
        </div>
        <div className="muted small mt8">Budget ₹{trip.budget.toLocaleString()} {trip.budgetShape === "perPerson" ? "per person" : "total"}</div>
        {trip.interests.length > 0 && (
          <div className="row mt8 wrap">
            {trip.interests.map((i) => <span key={i} className="chip">{i}</span>)}
          </div>
        )}
      </div>

      {loading && (
        <div className="empty glass">
          <span className="material-symbols-outlined spin">progress_activity</span>
          <div className="muted small">Building your day-by-day itinerary…</div>
        </div>
      )}

      {!loading && error && (
        <div className="empty glass warn">
          <span className="material-symbols-outlined">error</span>
          <div className="small">{error}</div>
        </div>
      )}

      {!loading && !error && plan && (
        <>
          <div className="section-head mt12">Day-wise Plan</div>
          {plan.warning && (
            <div className="empty glass warn">
              <span className="material-symbols-outlined">info</span>
              <div className="small">{plan.warning}</div>
            </div>
          )}
          {plan.days.map((d) => <DayCard key={d.day} day={d} />)}
          <div className="disclaimer small mt8">
            <span className="material-symbols-outlined">verified</span>
            {plan.disclaimer}
            {plan.relaxed && " • Interest filter was thin, so nearby options were included."}
          </div>
          <div className="muted tiny">Transport, budget and stays come next. Order is optimized to avoid backtracking.</div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ input window (7-step wizard)
export default function TripInput() {
  const { setTrip } = useApp();
  const [draft, setDraft] = useState<TripInputData>({ ...DEFAULT_DRAFT, budgetSplits: { ...AUTO_SPLITS } });
  const [step, setStep] = useState(0);

  const set = (patch: Partial<TripInputData>) => setDraft((d) => ({ ...d, ...patch }));
  const daysCount = useMemo(() => (
    draft.durationMode === "days" ? draft.days : daysBetween(draft.startDate, draft.endDate)
  ), [draft]);

  const canNext = useMemo(() => {
    switch (step) {
      case 0: return draft.suggestDestination || !!draft.destination || draft.destination === null;
      case 1: return draft.durationMode === "days" ? draft.days >= 1 : daysCount >= 1;
      case 2: return draft.groupSize >= 1;
      case 3: return draft.budget > 0;
      case 4: return draft.interests.length > 0;
      case 5: return true;
      default: return true;
    }
  }, [step, draft, daysCount]);

  // Step 0 always passable (optional destination) so user can rely on "suggest" + interests.
  const generate = () => {
    const final = { ...draft, days: daysCount > 0 ? daysCount : draft.days };
    setTrip(final);
  };

  const goEdit = (s: number) => setStep(s);

  return (
    <div className="trip-wizard">
      {/* stepper */}
      <div className="trip-steps row">
        {STEP_TITLES.map((t, i) => (
          <button
            key={t}
            className={`step-chip ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
            onClick={() => i < step && setStep(i)}
            title={t}
          >
            {i < step ? <span className="material-symbols-outlined">check</span> : <span>{i + 1}</span>}
          </button>
        ))}
      </div>
      <div className="step-title">{STEP_TITLES[step]}</div>

      {/* STEP 1 Destination */}
      {step === 0 && (
        <div className="step-body">
          <DestinationInput value={draft.destination} onPick={(p) => set({ destination: p })} />
          <label className="check-row">
            <input type="checkbox" checked={draft.suggestDestination} onChange={(e) => set({ suggestDestination: e.target.checked })} />
            <span>Suggest a destination for me (fit to climate, distance, themes)</span>
          </label>
        </div>
      )}

      {/* STEP 2 Duration */}
      {step === 1 && (
        <div className="step-body">
          <div className="mode-tabs row">
            <button className={`chip ${draft.durationMode === "dates" ? "active" : ""}`} onClick={() => set({ durationMode: "dates" })}>Date range</button>
            <button className={`chip ${draft.durationMode === "days" ? "active" : ""}`} onClick={() => set({ durationMode: "days" })}>Just # of days</button>
          </div>
          {draft.durationMode === "dates" ? (
            <div className="params col">
              <label className="param">
                <span className="muted small">Start</span>
                <input type="date" className="text-input" value={draft.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value || null })} />
              </label>
              <label className="param">
                <span className="muted small">End</span>
                <input type="date" className="text-input" value={draft.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value || null })} />
              </label>
              {daysCount > 0 && <div className="muted small">→ {daysCount} day{daysCount === 1 ? "" : "s"}</div>}
            </div>
          ) : (
            <label className="param">
              <span className="muted small">Days</span>
              <input type="number" min={1} max={30} className="text-input" value={draft.days} onChange={(e) => set({ days: Math.max(1, Number(e.target.value)) })} />
            </label>
          )}
        </div>
      )}

      {/* STEP 3 Group */}
      {step === 2 && (
        <div className="step-body">
          <div className="group-chips row wrap">
            {GROUP_TYPES.map((g) => (
              <button key={g.key} className={`chip ${draft.groupType === g.key ? "active" : ""}`} onClick={() => set({ groupType: g.key })}>
                <span className="material-symbols-outlined">{g.icon}</span> {g.label}
              </button>
            ))}
          </div>
          <label className="param">
            <span className="muted small">Travellers</span>
            <input type="number" min={1} max={40} className="text-input" value={draft.groupSize} onChange={(e) => set({ groupSize: Math.max(1, Number(e.target.value)) })} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={draft.hasKids} onChange={(e) => set({ hasKids: e.target.checked })} />
            <span>Traveling with children</span>
          </label>
        </div>
      )}

      {/* STEP 4 Budget */}
      {step === 3 && (
        <div className="step-body">
          <div className="mode-tabs row">
            <button className={`chip ${draft.budgetShape === "total" ? "active" : ""}`} onClick={() => set({ budgetShape: "total" })}>Total</button>
            <button className={`chip ${draft.budgetShape === "perPerson" ? "active" : ""}`} onClick={() => set({ budgetShape: "perPerson" })}>Per person</button>
          </div>
          <label className="param">
            <span className="muted small">Budget ₹ ({draft.budgetShape === "total" ? "trip total" : "per person"})</span>
            <input type="number" min={0} className="text-input" value={draft.budget} onChange={(e) => set({ budget: Math.max(0, Number(e.target.value)) })} />
          </label>
          <div className="split-head row"><span className="muted small">Spend split (%)</span>
            <button className="link-btn" onClick={() => set({ budgetSplits: { ...AUTO_SPLITS } })}>Reset auto</button>
          </div>
          {SPLIT_KEYS.map((k) => (
            <label key={k} className="split-row">
              <span className="muted small split-label">{SPLIT_LABELS[k]}</span>
              <input type="range" min={0} max={100} value={draft.budgetSplits[k] ?? 0}
                onChange={(e) => set({ budgetSplits: adjustSplit(draft.budgetSplits, k, Number(e.target.value)) })} />
              <span className="muted small split-val">{draft.budgetSplits[k] ?? 0}%</span>
            </label>
          ))}
          <div className={`split-total ${splitSum(draft.budgetSplits) === 100 ? "ok" : "warn"}`}>
            {splitSum(draft.budgetSplits)}% {splitSum(draft.budgetSplits) === 100 ? "" : "— sliders share 100, auto-adjusted"}
          </div>
        </div>
      )}

      {/* STEP 5 Interests */}
      {step === 4 && (
        <div className="step-body">
          <div className="group-chips row wrap">
            {INTERESTS.map((i) => (
              <button key={i} className={`chip ${draft.interests.includes(i) ? "active" : ""}`}
                onClick={() => set({ interests: draft.interests.includes(i) ? draft.interests.filter((x) => x !== i) : [...draft.interests, i] })}>
                {i}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 6 Pace */}
      {step === 5 && (
        <div className="step-body">
          <div className="pace-list">
            {PACES.map((p) => (
              <button key={p.key} className={`pace-card glass ${draft.pace === p.key ? "active" : ""}`} onClick={() => set({ pace: p.key })}>
                <span className="material-symbols-outlined">{p.icon}</span>
                <span><b>{p.label}</b><div className="muted small">{p.desc}</div></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 7 Summary */}
      {step === 6 && (
        <div className="step-body">
          <SummaryRow label="Destination" icon="location_on" onEdit={() => goEdit(0)}
            value={draft.suggestDestination ? "Auto-suggest (fit to climate/themes)" : (draft.destination?.name ?? "Not set")} />
          <SummaryRow label="Duration" icon="calendar_month" onEdit={() => goEdit(1)}
            value={daysCount > 0 ? `${daysCount} day${daysCount === 1 ? "" : "s"}` : `${draft.days} day${draft.days === 1 ? "" : "s"}`}
            hint={draft.durationMode === "dates" && draft.startDate ? `${draft.startDate} → ${draft.endDate ?? "…"}` : undefined} />
          <SummaryRow label="Group" icon="groups" onEdit={() => goEdit(2)}
            value={`${draft.groupSize} traveller${draft.groupSize === 1 ? "" : "s"} • ${GROUP_TYPES.find((g) => g.key === draft.groupType)?.label}${draft.hasKids ? " • with kids" : ""}`} />
          <SummaryRow label="Budget" icon="account_balance_wallet" onEdit={() => goEdit(3)}
            value={`₹${draft.budget.toLocaleString()} ${draft.budgetShape === "perPerson" ? "per person" : "total"} • ${JSON.stringify(draft.budgetSplits) !== JSON.stringify(AUTO_SPLITS) ? "custom split" : "auto split"}`} />
          <SummaryRow label="Interests" icon="favorite" onEdit={() => goEdit(4)}
            value={draft.interests.length ? draft.interests.join(" · ") : "None selected"} />
          <SummaryRow label="Pace" icon="balance" onEdit={() => goEdit(5)}
            value={PACES.find((p) => p.key === draft.pace)?.label ?? draft.pace} />
        </div>
      )}

      <div className="nav-row row">
        <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <span className="material-symbols-outlined">chevron_left</span> Back
        </button>
        {step < 6 ? (
          <button className="btn" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Next <span className="material-symbols-outlined">chevron_right</span>
          </button>
        ) : (
          <button className="btn primary" onClick={generate} disabled={!canNext}>
            <span className="material-symbols-outlined">auto_awesome</span> Generate My Trip
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, icon, value, hint, onEdit }: {
  label: string; icon: string; value: string; hint?: string; onEdit: () => void;
}) {
  return (
    <div className="summary-row glass">
      <span className="material-symbols-outlined" style={{ color: "var(--primary)" }}>{icon}</span>
      <span className="summary-main">
        <span className="muted small">{label}</span>
        <span className="summary-val">{value}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <button className="icon-btn" onClick={onEdit} title={`Edit ${label}`}>
        <span className="material-symbols-outlined">edit</span>
      </button>
    </div>
  );
}