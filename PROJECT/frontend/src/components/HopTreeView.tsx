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

// ============================================================ tree layout math

const NODE_W = 168;
const NODE_H = 50;
const MIN_EDGE = 84;
const MAX_EDGE = 190;
const Y_GAP = 78;
const TOP_PAD = 46;
const LEFT_PAD = 20;
const RIGHT_PAD = 40;
const MAX_CHILDREN = 3; // branches capped per stop node (IMPLEMENTATION_PLAN §5)

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
  let maxX = LEFT_PAD;
  let minY = Infinity;
  let maxY = -Infinity;
  let nid = 0;

  const mk = (depth: number, x: number, y: number, label: string, kind: "source" | "dest" | "stop",
              sub: string | null, stop?: HopOption["destinationStop"]): TNode => {
    const n: TNode = { id: `n${nid++}`, depth, x, y, label, sub, kind, stopLat: stop?.lat, stopLng: stop?.lng };
    nodes.push(n);
    maxX = Math.max(maxX, x + NODE_W);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    return n;
  };

  const placeChildren = (parent: TNode, depth: number) => {
    const seg = levels[depth];
    if (!seg) return;
    let children = optionsForLevel(seg, confirmed.slice(0, depth), depth).slice(0, MAX_CHILDREN);
    if (children.length === 0) return;

    const confirmedOpt = depth < confirmed.length ? confirmed[depth] : null;
    const hasConfirmed = confirmedOpt != null;
    const confirmedInList = hasConfirmed && children.some((c) => c.optionId === confirmedOpt.optionId);
    if (hasConfirmed && !confirmedInList) {
      if (children.length >= MAX_CHILDREN) children = children.slice(0, MAX_CHILDREN - 1);
      children.push(confirmedOpt!);
    }
    // stable order: confirmed first, then top-recommended, then the rest
    children = children.filter((c) => !hasConfirmed || c.optionId !== confirmedOpt!.optionId);
    const ordered = [
      ...(hasConfirmed ? [confirmedOpt!] : []),
      ...children.filter((c) => c.isTopRecommended),
      ...children.filter((c) => !c.isTopRecommended),
    ];

    const maxDist = Math.max(1, ...ordered.map((c) => c.distanceKm ?? 0));
    const n = ordered.length;
    const mid = Math.floor(n / 2);

    for (let k = 0; k < n; k++) {
      const c = ordered[k];
      const isConfirmed = hasConfirmed && c.optionId === confirmedOpt!.optionId;
      const edgeLen = MIN_EDGE + ((c.distanceKm ?? 0) / maxDist) * (MAX_EDGE - MIN_EDGE);
      let cy = parent.y + (k - mid) * Y_GAP;
      if (isConfirmed) cy = parent.y; // chosen path stays horizontal
      const cx = parent.x + NODE_W + edgeLen;
      const km = havKm(c.destinationStop, dest);
      const child = mk(
        depth + 1, cx, cy,
        c.destinationStop?.name ?? (c.mode === "walk" ? "Walk" : "Stop"),
        "stop",
        km != null ? `→ ${km.toFixed(1)} km to dest` : null,
        c.destinationStop,
      );
      edges.push({
        from: parent, to: child, option: c, confirmed: isConfirmed,
        label: c.mode === "walk" ? "walk" : c.routeNumber ?? MODE_META[c.mode ?? ""]?.label ?? c.mode ?? "",
        mode: c.mode ?? "connecting",
        fromDepth: depth, km: c.distanceKm ?? null,
      });
      if (isConfirmed) {
        // only the chosen path expands deeper (alternatives are single-branch)
        placeChildren(child, depth + 1);
      }
    }
  };

  const root = mk(0, LEFT_PAD, TOP_PAD, source?.name ?? "Source", "source",
    dest ? `→ ${havKm(source ?? undefined, dest)?.toFixed(1) ?? "?"} km to dest` : null);
  placeChildren(root, 0);

  // final destination node when the journey is complete (or as the end cap)
  const lastConfirmedStop = confirmed.length
    ? nodes.find((n) => n.kind === "stop" && n.label === confirmed[confirmed.length - 1].destinationStop?.name)
    : null;
  const lastStop = lastConfirmedStop ?? (confirmed.length ? nodes.slice().reverse().find((n) => n.kind === "stop") : null);
  if (complete && lastStop) {
    const dm = mk(
      lastStop.depth + 1, lastStop.x + NODE_W + MIN_EDGE + 30, lastStop.y,
      dest?.name ?? "Destination", "dest",
      "Final stop", dest ?? undefined,
    );
    edges.push({
      from: lastStop, to: dm, confirmed: true, label: "arrive", mode: "walk",
      fromDepth: lastStop.depth, km: null, option: {} as HopOption,
    });
  }

  return {
    nodes, edges,
    width: maxX + RIGHT_PAD,
    height: Math.max(TOP_PAD * 2 + NODE_H, maxY - minY + NODE_H + TOP_PAD * 2),
  };
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
            const bend = Math.max(18, (x2 - x1) / 2);
            const midX = (x1 + x2) / 2;
            const color = legColor(e.mode);
            return (
              <g key={`e${i}`}>
                <path
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={e.confirmed ? 4 : 2}
                  strokeDasharray={e.confirmed ? undefined : "5 6"}
                  opacity={e.confirmed ? 1 : 0.4}
                />
                {e.label && (
                  <text
                    x={midX}
                    y={(y1 + y2) / 2 - 6}
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
            const stroke = n.kind === "source" ? "#27ae60" : n.kind === "dest" ? "#eb5757" : legColor("bus");
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
                  fill="var(--panel-strong)"
                  stroke={n.kind === "source" || n.kind === "dest" ? stroke : "#6c5ce7"}
                  strokeWidth={n.kind === "source" || n.kind === "dest" ? 3 : 2}
                />
                <text x={n.x + 10} y={n.y - 4} className="node-label" dominantBaseline="middle">
                  {n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label}
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