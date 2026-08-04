import { useMemo, useState } from "react";
import type { HopOption, LatLng, Segment } from "../types";
import "./HopTreeView.css";

export const MODE_META: Record<string, { icon: string; color: string; label: string }> = {
  bus: { icon: "directions_bus", color: "#6c5ce7", label: "Bus" },
  metro: { icon: "subway", color: "#00cec9", label: "Metro" },
  train: { icon: "train", color: "#e17055", label: "Train" },
  walk: { icon: "directions_walk", color: "#95a5a6", label: "Walk" },
  ride: { icon: "local_taxi", color: "#f39c12", label: "Cab" },
};

export function legColor(mode: string): string {
  return MODE_META[mode]?.color ?? "#6c5ce7";
}

export const MAX_VISIBLE = 10;
const CATCH_BUFFER_MIN = 4; // catch-the-bus buffer (PROMPT_3 §3.2)

function timeToMin(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// straight-line km between a stop and the final destination (progress indicator)
export function havKm(a: { lat: number; lng: number } | undefined, b: LatLng | null): number | null {
  if (!a || !b) return null;
  const R = 6371;
  const dLa = ((b.lat - a.lat) * Math.PI) / 180;
  const dLo = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLa / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function dedupeOptions(options: HopOption[]): HopOption[] {
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

// de-dup branches that resolve to the SAME physical stop. Verified by rounded
// coordinates first (≈300 m at Bengaluru latitude), then by name, so two buses
// into the same stop collapse into one node (§2.1).
const COORD_ROUND = 0.0027; // ~300 m
function dedupeByStop(options: HopOption[]): HopOption[] {
  const groups = new Map<string, HopOption[]>();
  const key = (o: HopOption) =>
    `${Math.round((o.destinationStop?.lat ?? 0) / COORD_ROUND)}|${Math.round((o.destinationStop?.lng ?? 0) / COORD_ROUND)}`;
  for (const o of options) {
    const k = key(o);
    const arr = groups.get(k) ?? [];
    arr.push(o);
    groups.set(k, arr);
  }
  const out: HopOption[] = [];
  for (const arr of groups.values()) {
    out.push(arr.find((o) => o.isTopRecommended) ?? arr[0]);
  }
  return out;
}

// client-side filter for a hop column: options must connect from the previously
// chosen stop, depart after its arrival + catch buffer, and never route back to a
// stop already on the journey (PROMPT_3 §T3 + §20 #37)
export function optionsForLevel(seg: Segment | undefined, confirmedUpTo: HopOption[], idx: number): HopOption[] {
  if (!seg) return [];
  const prev = idx > 0 ? confirmedUpTo[idx - 1] : null;
  const prevStop = prev?.destinationStop?.name?.toLowerCase();
  const prevArr = timeToMin(prev?.arrivalTime);
  const visited = new Set<string>();
  for (const c of confirmedUpTo) {
    const n = c.destinationStop?.name?.toLowerCase();
    if (n) visited.add(n);
  }
  const opts = (seg.options ?? []).filter((o) => {
    if (prevStop) {
      const cf = o.connectedFrom?.toLowerCase();
      if (cf && cf !== prevStop) return false;
      if (prevArr != null) {
        const d = timeToMin(o.departureTime);
        if (d != null && d < prevArr + CATCH_BUFFER_MIN) return false;
      }
    }
    const dn = o.destinationStop?.name?.toLowerCase();
    if (dn && visited.has(dn)) return false; // don't circle back to a used stop
    return true;
  });
  return dedupeOptions(opts).slice(0, MAX_VISIBLE);
}

// ============================================================ layout
//
// Fixed-column layered tree. Each depth is one COLUMN on the x axis. The chosen
// path rides a single horizontal RAIL line (y = RAIL_Y). A rail node's
// alternative branches fan symmetrically ABOVE/BELOW the rail inside their own
// column, so no node box can overlap another and edges leave the rail without
// crossing (§1). X advances one column per depth (rough distance feel §1.9).

const NODE_W = 172;
const NODE_H = 54;
const COL_W = 250;   // horizontal stride per depth
const RAIL_Y = 170;  // the horizontal rail the chosen path rides
const ALT_OFF = 78;  // vertical offset of each alternative from the rail
const LEFT_PAD = 26;
const RIGHT_PAD = 70;
const TOP_PAD = 20;
const MAX_ALTS = 2;  // alternatives per rail node (rail + these = MAX_CHILDREN)

interface TNode {
  id: string;
  depth: number;
  x: number;
  y: number;
  label: string;
  sub: string | null;
  kind: "source" | "dest" | "stop";
  stopLat?: number;
  stopLng?: number;
  confirmed?: boolean;
}

interface TEdge {
  from: TNode;
  to: TNode;
  option: HopOption;
  confirmed: boolean;
  label: string;
  mode: string;
  fromDepth: number;
  km: number | null;
}

interface TreeLayout {
  nodes: TNode[];
  edges: TEdge[];
  width: number;
  height: number;
}

function buildTree(
  levels: Segment[],
  confirmed: HopOption[],
  source: LatLng | null,
  dest: LatLng | null,
  complete: boolean,
): TreeLayout {
  const nodes: TNode[] = [];
  const edges: TEdge[] = [];
  let nid = 0;
  const mk = (depth: number, x: number, y: number, label: string, kind: TNode["kind"],
              sub: string | null, stop?: HopOption["destinationStop"], confirmedFlag = false): TNode => {
    const n: TNode = {
      id: `n${nid++}`, depth, x, y, label, sub, kind,
      stopLat: stop?.lat, stopLng: stop?.lng, confirmed: confirmedFlag,
    };
    nodes.push(n);
    return n;
  };
  const edgeLabel = (opt: HopOption) =>
    opt.mode === "walk" ? "walk"
      : opt.routeNumber ?? MODE_META[opt.mode ?? ""]?.label ?? opt.mode ?? "";

  const kmRoot = havKm(source ?? undefined, dest);

  // ---- root + rail (confirmed path) --------------------------------
  const root = mk(0, LEFT_PAD, RAIL_Y, source?.name ?? "Source", "source",
    kmRoot != null ? `→ ${kmRoot.toFixed(1)} km to dest` : null, undefined, true);

  // BUG2: a transit first hop implies walking to its boarding point first. Show
  // that access walk as a real node unless it is trivial (<50 m). The walk is
  // display-only here — `confirmed` stays the chained leg list the backend
  // time-chains on, so indices for alternatives are shifted below accordingly.
  const access = confirmed[0]?.accessWalk;
  const hasAccessWalk = confirmed.length > 0 &&
    confirmed[0].mode !== "walk" &&
    !!access &&
    (access.distanceKm ?? 0) >= 0.05;
  const shift = hasAccessWalk ? 1 : 0;

  const rail: TNode[] = [root];
  if (hasAccessWalk && access) {
    const wn = mk(1, LEFT_PAD + COL_W, RAIL_Y,
      `Walk to ${access.stopName}`, "stop",
      `→ ${access.distanceKm.toFixed(2)} km · ${access.durationMin} min`, {
        name: access.stopName, lat: access.lat, lng: access.lng,
      }, true);
    rail.push(wn);
    edges.push({
      from: root, to: wn, option: {} as HopOption, confirmed: true,
      label: "walk", mode: "walk", fromDepth: 0, km: access.distanceKm,
    });
  }

  for (let d = 0; d < confirmed.length; d++) {
    const opt = confirmed[d];
    const km = havKm(opt.destinationStop, dest);
    const node = mk(d + 1 + shift, LEFT_PAD + (d + 1 + shift) * COL_W, RAIL_Y,
      opt.destinationStop?.name ?? "Stop", "stop",
      km != null ? `→ ${km.toFixed(1)} km to dest` : null, opt.destinationStop, true);
    rail.push(node);
    edges.push({
      from: rail[rail.length - 2], to: node, option: opt, confirmed: true,
      label: edgeLabel(opt), mode: opt.mode ?? "walk",
      fromDepth: d, km: opt.distanceKm ?? null,
    });
  }

  // ---- destination cap ----------------------------------------------
  if (complete && rail.length > 1) {
    const last = rail[rail.length - 1];
    const dm = mk(last.depth + 1, last.x + COL_W, RAIL_Y,
      dest?.name ?? "Destination", "dest", "Final stop", dest ?? undefined, true);
    edges.push({
      from: last, to: dm, confirmed: true, label: "arrive", mode: "walk",
      fromDepth: last.depth, km: null, option: {} as HopOption,
    });
    rail.push(dm);
  }

  // ---- alternatives: fan above/below each rail node -----------------
  // Iterate over rail node columns. The segment level feeding a rail column is
  // (col - shift): the access-walk column consumed a column but no segment level.
  // Confirmed may be empty (initial state) so Source's own branches always render.
  const walkCol = hasAccessWalk ? 1 : -1;
  for (const anchorNode of rail) {
    const col = anchorNode.depth;
    if (col === walkCol) continue;
    const colLevel = col - shift;
    if (colLevel < 0 || colLevel >= levels.length) continue;
    const seg = levels[colLevel];
    if (!seg) continue;
    const base = confirmed.slice(0, colLevel);
    let alts = optionsForLevel(seg, base, colLevel);
    // never duplicate the rail's own next stop as an alternative
    const railNext = confirmed[colLevel]?.destinationStop?.name?.toLowerCase() ?? null;
    alts = alts.filter((o) => {
      const stopName = o.destinationStop?.name?.toLowerCase() ?? "";
      return !(railNext && stopName === railNext);
    });
    alts = dedupeByStop(alts).slice(0, MAX_ALTS);

    // alternate above/below the rail symmetrically; rail line stays clear
    const sides = [1, -1];
    alts.forEach((opt, k) => {
      const km = havKm(opt.destinationStop, dest);
      const side = sides[k % sides.length];
      const offset = (Math.floor(k / sides.length) + 1) * ALT_OFF * side;
      const node = mk(col + 1, LEFT_PAD + (col + 1) * COL_W, RAIL_Y + offset,
        opt.destinationStop?.name ?? "Stop", "stop",
        km != null ? `\u2192 ${km.toFixed(1)} km to dest` : null, opt.destinationStop);
      edges.push({
        from: anchorNode, to: node, option: opt, confirmed: false,
        label: edgeLabel(opt), mode: opt.mode ?? "walk",
        fromDepth: colLevel, km: opt.distanceKm ?? null,
      });
    });
  }


  // ---- bounds --------------------------------------------------------
  const lastCol = Math.max(0, ...nodes.map((n) => n.depth));
  const width = LEFT_PAD + (lastCol + 1) * COL_W + RIGHT_PAD;
  const maxAltY = Math.max(...nodes.map((n) => n.y));
  const height = maxAltY + NODE_H / 2 + TOP_PAD;
  return { nodes, edges, width, height };
}

// ============================================================ component

export default function HopTreeView({ levels, confirmed, source, dest, complete, onSelect, loading }: {
  levels: Segment[];
  confirmed: HopOption[];
  source: LatLng | null;
  dest: LatLng | null;
  complete: boolean;
  onSelect: (depth: number, opt: HopOption) => void;
  loading?: boolean;
}) {
  const [detail, setDetail] = useState<{ depth: number; opt: HopOption } | null>(null);

  const layout = useMemo(
    () => buildTree(levels, confirmed, source, dest, complete),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [levels, confirmed, source, dest, complete],
  );

  const { nodes, edges, width, height } = layout;
  const viewH = Math.max(300, height);

  return (
    <div className="hop-tree">
      <div className="hop-tree-scroll">
        <svg className="tree-svg" width={width} height={viewH} viewBox={`0 0 ${width} ${viewH}`}>
          {/* edges */}
          {edges.map((e, i) => {
            const x1 = e.from.x + NODE_W;
            const y1 = e.from.y;
            const x2 = e.to.x;
            const y2 = e.to.y;
            const bend = Math.max(20, (x2 - x1) / 2);
            const color = legColor(e.mode);
            const dirUp = y2 < y1; // curve exits upward or downward
            const labelDy = dirUp ? -10 : 18;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            return (
              <g key={`e${i}`}>
                <path
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={e.confirmed ? 4 : 2}
                  strokeDasharray={e.confirmed ? undefined : "5 6"}
                  opacity={e.confirmed ? 1 : 0.45}
                />
                {e.label && (
                  <text
                    x={midX}
                    y={midY + labelDy}
                    textAnchor="middle"
                    className="edge-label"
                    fill={color}
                  >
                    {e.label}
                    {e.km != null && e.km > 0 ? ` · ${e.km.toFixed(1)} km` : ""}
                  </text>
                )}
              </g>
            );
          })}

          {/* nodes */}
          {nodes.map((n) => {
            const isChosenStop = n.kind === "stop";
            const stroke = n.kind === "source" ? "#27ae60" : n.kind === "dest" ? "#eb5757" : "#6c5ce7";
            const onNodeClick = isChosenStop && n.stopLat != null
              ? () => {
                  const e = edges.find((x) => x.to.id === n.id);
                  if (e) onSelect(e.fromDepth, e.option);
                }
              : undefined;
            return (
              <g key={n.id} className={`tree-node ${onNodeClick ? "clickable" : ""}`} onClick={onNodeClick}>
                <rect
                  x={n.x}
                  y={n.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  fill={n.confirmed ? "rgba(108,92,231,0.12)" : "var(--panel-strong)"}
                  stroke={n.kind === "source" || n.kind === "dest" ? stroke : n.confirmed ? "#6c5ce7" : "rgba(120,130,160,0.6)"}
                  strokeWidth={n.kind === "source" || n.kind === "dest" ? 3 : n.confirmed ? 2 : 1.5}
                />
                <text x={n.x + 10} y={n.y - 4} className="node-label" dominantBaseline="middle">
                  {n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label}
                </text>
                {n.sub && (
                  <text x={n.x + 10} y={n.y + 14} className="node-sub" dominantBaseline="middle">
                    {n.sub}
                  </text>
                )}
                {n.kind === "source" && <text x={n.x + NODE_W - 10} y={n.y - 4} textAnchor="end" className="node-badge">A</text>}
                {n.kind === "dest" && <text x={n.x + NODE_W - 10} y={n.y - 4} textAnchor="end" className="node-badge">B</text>}
              </g>
            );
          })}
        </svg>
        {loading && <div className="skeleton tree-skel" />}
      </div>

      {detail && (
        <div className="hop-detail glass-strong anim-in">
          <div className="spread">
            <span className="row">
              <span className="material-symbols-outlined" style={{ color: legColor(detail.opt.mode ?? "") }}>
                {MODE_META[detail.opt.mode ?? ""]?.icon ?? "directions"}
              </span>
              <b>{detail.opt.mode === "walk" ? "Walk" : detail.opt.routeNumber ?? detail.opt.mode}</b>
              <span className="muted small">→ {detail.opt.destinationStop?.name}</span>
            </span>
            <button className="icon-btn" onClick={() => setDetail(null)} title="Close">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="row mt8">
            <span className="stat"><b>{detail.opt.durationMin ?? "—"}</b> min</span>
            {detail.opt.distanceKm != null && detail.opt.distanceKm > 0 && (
              <span className="stat"><b>{detail.opt.distanceKm.toFixed(1)}</b> km</span>
            )}
            <span className="stat">
              <b>{detail.opt.fare != null ? `₹${detail.opt.fare}` : detail.opt.mode === "walk" ? "Free" : "—"}</b>
              {detail.opt.perPersonFare != null ? ` (₹${detail.opt.perPersonFare}/pp)` : ""}
            </span>
          </div>
          <div className="muted small mt8">
            {detail.opt.departureTime ? `Departs ${detail.opt.departureTime}` : ""}
            {detail.opt.arrivalTime ? ` · arrives ${detail.opt.arrivalTime}` : ""}
            {detail.opt.transitOptionsFromThisStop != null
              ? ` · ${detail.opt.transitOptionsFromThisStop} onward options`
              : ""}
          </div>
          <button className="btn full mt8" onClick={() => { onSelect(detail.depth, detail.opt); setDetail(null); }}>
            Take this hop
          </button>
        </div>
      )}
    </div>
  );
}