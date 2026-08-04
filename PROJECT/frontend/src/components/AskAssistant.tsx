import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { AskContext, LiveContext } from "../types";
import "./AskAssistant.css";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  factors?: string[];
  live?: LiveContext | null;
}

const ROUTE_PROMPTS = [
  "Is it raining at my destination?",
  "Is traffic heavy right now?",
  "What's the cheapest ride?",
  "Any news affecting this route?",
];

const TRIP_PROMPTS = [
  "Why were these places chosen?",
  "Is the weather good for sightseeing?",
  "Any events or news to plan around?",
  "What ride budget should I expect?",
];

function LiveSummary({ live }: { live: LiveContext | null }) {
  if (!live) return null;
  const weather = live.weather?.condition && live.weather.condition !== "unavailable" ? live.weather : null;
  const traffic = live.traffic?.label && live.traffic.label !== "unavailable" ? live.traffic : null;
  const prices = live.prices ?? [];
  const news = live.news ?? [];
  const rows: { icon: string; label: string; value: string }[] = [];
  if (weather) {
    const bits = [weather.condition];
    if (weather.temp_c != null) bits.push(`${weather.temp_c}°C`);
    if (weather.rain_next_hour) bits.push("rain next hour");
    rows.push({ icon: "cloud", label: "Weather", value: bits.join(" • ") });
  }
  if (traffic) {
    rows.push({ icon: "traffic", label: "Traffic", value: `${traffic.label}${traffic.source ? ` (${traffic.source})` : ""}` });
  }
  if (prices.length) {
    const best = prices.reduce((a, b) => ((b.total ?? Infinity) < (a.total ?? Infinity) ? b : a), prices[0]);
    rows.push({ icon: "local_taxi", label: "Rides", value: `${best.provider} ₹${best.total} (${best.source})` });
  }
  if (news.length) {
    rows.push({ icon: "newspaper", label: "News", value: `${news.length} item(s)` });
  }
  if (!rows.length) return null;
  return (
    <details className="ask-live">
      <summary>
        <span className="material-symbols-outlined">sensors</span>
        Live data behind this answer
      </summary>
      {rows.map((r) => (
        <div key={r.label} className="ask-live-row">
          <span className="material-symbols-outlined">{r.icon}</span>
          <span className="muted small">{r.label}</span>
          <span className="ask-live-val">{r.value}</span>
        </div>
      ))}
      {news.length > 0 && (
        <ul className="ask-news">
          {news.slice(0, 3).map((n, i) => (
            <li key={i} className="muted small">{n.title}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default function AskAssistant({ context, headline }: { context: AskContext; headline?: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const prompts = context.destination ? TRIP_PROMPTS : ROUTE_PROMPTS;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api.ask(q, context);
      setMsgs((m) => [...m, {
        role: "assistant",
        text: res.synthesis?.answer || "No answer returned.",
        factors: res.synthesis?.factors,
        live: res.live_context,
      }]);
    } catch {
      setMsgs((m) => [...m, {
        role: "assistant",
        text: "Could not reach the assistant right now. Try again in a moment.",
        factors: ["request failed"],
      }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ask-card glass anim-in">
      <div className="ask-head">
        <span className="row">
          <span className="material-symbols-outlined ask-logo">auto_awesome</span>
          <b>{headline ?? "Ask VOYAGER"}</b>
        </span>
        <span className="badge live">LIVE</span>
      </div>

      {msgs.length === 0 && !busy && (
        <div className="ask-chips row wrap">
          {prompts.map((p) => (
            <button key={p} className="chip" onClick={() => send(p)}>{p}</button>
          ))}
        </div>
      )}

      <div className="ask-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={`ask-msg ${m.role}`}>
            <div className="ask-bubble">{m.text}</div>
            {m.factors?.length ? (
              <div className="ask-factors row wrap">
                {m.factors.map((f) => <span key={f} className="ask-factor muted small">{f}</span>)}
              </div>
            ) : null}
            {m.role === "assistant" && m.live ? <LiveSummary live={m.live} /> : null}
          </div>
        ))}
        {busy && (
          <div className="ask-msg assistant">
            <div className="ask-bubble"><span className="spinner inline" /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="ask-input-row row">
        <input
          className="text-input"
          placeholder="Ask about the weather, traffic, rides…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        <button className="btn" onClick={() => send(input)} disabled={!input.trim() || busy} title="Ask">
          <span className="material-symbols-outlined">send</span>
        </button>
      </div>
      <div className="muted tiny mt8">Answers use live data only; the assistant never invents fares or timings.</div>
    </section>
  );
}
