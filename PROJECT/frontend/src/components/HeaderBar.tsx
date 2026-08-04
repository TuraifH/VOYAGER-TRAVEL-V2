import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useApp } from "../context/AppContext";
import type { LatLng, WeatherNow } from "../types";
import "./HeaderBar.css";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  const [showDate, setShowDate] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const expand = () => {
    setShowDate(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShowDate(false), 2500);
  };

  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const dateStr = now.toLocaleDateString([], {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

  return (
    <button
      type="button"
      className={`clock${showDate ? " clock-expanded" : ""}`}
      onClick={expand}
      onMouseEnter={expand}
      title="Show date"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={showDate ? "date" : "time"}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.12 }}
        >
          {showDate ? dateStr : timeStr}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const WEATHER_ICON: Record<string, string> = {
  clear: "sunny", cloudy: "cloud", fog: "foggy", rain: "rainy", snow: "weather_snowy",
  thunderstorm: "thunderstorm", drizzle: "grain", unknown: "help",
};

/* subtle continuous loops keyed by condition (CSS-driven, low amplitude) */
const AMBIENT: Record<string, string> = {
  clear: "wx-clear", cloudy: "wx-cloudy", fog: "wx-cloudy", rain: "wx-rain",
  drizzle: "wx-drizzle", snow: "wx-snow", thunderstorm: "wx-storm", unknown: "",
};

function V2Badge() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="logo-sub"
      initial={{ scale: 1, opacity: 1 }}
      animate={reduce ? {} : { scale: [1, 1.3, 1], opacity: [1, 0.55, 1] }}
      transition={{ duration: 0.6, ease: "easeOut", times: [0, 0.5, 1] }}
    >
      v2
    </motion.span>
  );
}

function WeatherCluster({ weather }: { weather: WeatherNow | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const condition = weather?.condition ?? "unknown";
  const icon = WEATHER_ICON[condition] ?? "help";

  return (
    <div className="wx-cluster" ref={wrapRef}>
      <button
        className={`wx-btn ${AMBIENT[condition] ?? ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Hourly forecast"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="material-symbols-outlined wx-glyph">{icon}</span>
        {weather?.temp_c != null ? (
          <span className="temp">{Math.round(weather.temp_c)}°</span>
        ) : (
          <span className="muted">—</span>
        )}
        <AnimatePresence>
          {weather?.rain_next_hour && (
            <motion.span
              key="rain"
              className="badge live wx-alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              rain soon
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="wx-pop glass-strong"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="wx-pop-head">
              <span className="material-symbols-outlined">{icon}</span>
              <span className="wx-pop-title">Hourly forecast</span>
            </div>
            {weather?.hourly?.length ? (
              <div className="wx-hours">
                {weather.hourly.map((h) => (
                  <div className="wx-hour" key={h.time}>
                    <span className="wx-hour-time">
                      {new Date(h.time).toLocaleTimeString([], { hour: "numeric" })}
                    </span>
                    <span className="material-symbols-outlined">
                      {WEATHER_ICON[h.condition] ?? "help"}
                    </span>
                    <span className="wx-hour-temp">
                      {h.temp_c != null ? `${Math.round(h.temp_c)}°` : "—"}
                    </span>
                    {h.rain_prob != null && h.rain_prob >= 30 && (
                      <span className="wx-hour-rain">{h.rain_prob}%</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="wx-empty muted small">Hourly forecast unavailable</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type LocStatus = "idle" | "locating" | "success";

function LocationControl() {
  const { userLoc, setUserLoc, setFlyTo } = useApp();
  const [status, setStatus] = useState<LocStatus>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const reDetect = () => {
    if (status === "locating" || !navigator.geolocation) return;
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(p);
        setFlyTo(p);
        setStatus("success");
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setStatus("idle"), 900);
      },
      () => {
        setUserLoc({ lat: 12.9716, lng: 77.5946, name: "Bengaluru" });
        setStatus("success");
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setStatus("idle"), 900);
      },
      { timeout: 6000 },
    );
  };

  return (
    <div
      className="loc-wrap"
      data-tip={status === "locating" ? "Detecting location…" : "Detected via IP — click to use GPS"}
    >
      <motion.button
        type="button"
        className="loc-btn"
        onClick={reDetect}
        aria-label="Re-detect current location"
        whileHover={status === "idle" ? { scale: 1.08 } : undefined}
        whileTap={{ scale: 0.95 }}
        animate={
          status === "locating"
            ? { rotate: 360 }
            : status === "success"
              ? { scale: [1, 1.3, 1] }
              : { rotate: 0, scale: 1 }
        }
        transition={
          status === "locating"
            ? { rotate: { duration: 0.7, ease: "linear", repeat: Infinity } }
            : { duration: 0.3, ease: "easeOut" }
        }
      >
        <span className="material-symbols-outlined">my_location</span>
      </motion.button>
      <span className="muted truncate loc-name">{userLoc?.name ?? "Bengaluru"}</span>
    </div>
  );
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <motion.button
      type="button"
      className="dark-toggle"
      onClick={onToggle}
      title="Toggle theme"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      whileHover={{ rotate: 20, scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={dark ? "sun" : "moon"}
          className="material-symbols-outlined"
          initial={{ rotate: 180, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 360, scale: 1, opacity: 1 }}
          exit={{ rotate: 180, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {dark ? "light_mode" : "dark_mode"}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export default function HeaderBar() {
  const { dark, toggleDark, weather } = useApp();

  return (
    <header className="header-bar glass">
      <div className="brand row">
        <span className="logo">VOYAGER</span>
        <V2Badge />
      </div>
      <div className="header-right row">
        <WeatherCluster weather={weather} />
        <LocationControl />
        <ThemeToggle dark={dark} onToggle={toggleDark} />
      </div>
      <Clock />
    </header>
  );
}
