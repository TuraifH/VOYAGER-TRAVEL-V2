import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useApp, scoreClass } from "../context/AppContext";
import type { Coord, HopOption, LatLng } from "../types";

const NUM_COLORS = [
  "#6c5ce7", "#00cec9", "#fd79a8", "#f39c12", "#27ae60",
  "#0984e3", "#e17055", "#a29bfe", "#00b894", "#d63031",
];

// sanity guard: never let a rogue coordinate fly the map outside the Bengaluru area
const BLANGARU = { minLat: 12.0, maxLat: 14.0, minLng: 76.5, maxLng: 78.5 };
function inBengaluru(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= BLANGARU.minLat && lat <= BLANGARU.maxLat &&
    lng >= BLANGARU.minLng && lng <= BLANGARU.maxLng;
}

function userIcon() {
  return L.divIcon({ className: "", html: `<div class="marker-user"></div>`, iconSize: [14, 14] });
}
function pinIcon(cls: string) {
  return L.divIcon({ className: "", html: `<div class="marker-pin ${cls}"><span>${cls[0].toUpperCase()}</span></div>`, iconSize: [30, 30] });
}
function numIcon(n: number) {
  const c = NUM_COLORS[n % NUM_COLORS.length];
  return L.divIcon({ className: "", html: `<div class="marker-num" style="background:${c}">${n + 1}</div>`, iconSize: [26, 26] });
}
function starIcon() {
  return L.divIcon({ className: "", html: `<div class="marker-star">★</div>`, iconSize: [40, 40] });
}
function newsIcon(cat: string) {
  const color = { traffic: "#e74c3c", weather: "#3498db", event: "#f1c40f", general: "#95a5a6" }[cat] ?? "#95a5a6";
  return L.divIcon({ className: "", html: `<div class="marker-num" style="background:${color}">!</div>`, iconSize: [22, 22] });
}

function FlyController({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (target && inBengaluru(target.lat, target.lng)) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.9 });
    }
  }, [target, map]);
  return null;
}

const MODE_COLOR: Record<string, string> = {
  bus: "#6c5ce7", metro: "#00cec9", train: "#e17055", walk: "#95a5a6",
  ride: "#f39c12", connecting: "#f39c12", dropoff: "#fd79a8",
};

function legGeometry(opt: HopOption): Coord[] {
  const g = opt.geometry;
  if (!g) return [];
  // geometry comes from the API as [lat, lng]; Leaflet wants [lat, lng]
  return g.map((pt: number[]) => [Number(pt[0]), Number(pt[1])]) as Coord[];
}

function NearbyRadius() {
  const { nearbyBase } = useApp();
  if (!nearbyBase || !inBengaluru(nearbyBase.lat, nearbyBase.lng)) return null;
  return (
    <Circle
      center={[nearbyBase.lat, nearbyBase.lng]}
      radius={nearbyBase.radiusM}
      pathOptions={{
        color: "#6c5ce7",
        fillColor: "#6c5ce7",
        fillOpacity: 0.08,
        dashArray: "6 6",
        weight: 2,
      }}
    />
  );
}

function RoutePolylines() {
  const { journey, ridePath } = useApp();
  const segs = journey.segments?.segments ?? [];
  const confirmedIds = new Set((journey.chosenLegs as HopOption[] | undefined)?.map((c) => c.optionId) ?? []);

  const lines: { pts: Coord[]; mode: string; solid: boolean; faint: boolean }[] = [];

  for (const seg of segs) {
    for (const opt of seg.options ?? []) {
      const pts = legGeometry(opt);
      if (pts.length < 2) continue;
      const confirmed = confirmedIds.has(opt.optionId);
      lines.push({
        pts,
        mode: opt.mode ?? "connecting",
        solid: confirmed || !!opt.isTopRecommended,
        faint: !confirmed && !opt.isTopRecommended,
      });
    }
  }

  return (
    <>
      {lines.map((ln, i) => (
        <Polyline
          key={i}
          positions={ln.pts}
          color={MODE_COLOR[ln.mode] ?? "#6c5ce7"}
          weight={ln.faint ? 3 : ln.solid ? 5 : 4}
          dashArray={ln.faint ? "4 6" : ln.mode === "walk" && !ln.solid ? "6 6" : undefined}
          opacity={ln.faint ? 0.3 : 0.85}
        />
      ))}
      {ridePath && ridePath.length > 1 && (
        <Polyline
          positions={ridePath as Coord[]}
          color={MODE_COLOR.ride}
          weight={5}
          opacity={0.95}
        />
      )}
    </>
  );
}

function Pins() {
  const { places, selected, userLoc, source, dest, journey, news } = useApp();
  const numbered = journey.active ? [] : places; // numbered pins hidden during journey

  return (
    <>
      {userLoc && <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon()} />}
      {source && (
        <Marker position={[source.lat, source.lng]} icon={pinIcon("green")}>
          <Popup>Source: {source.name}</Popup>
        </Marker>
      )}
      {dest && (
        <Marker position={[dest.lat, dest.lng]} icon={pinIcon("red")}>
          <Popup>Destination: {dest.name}</Popup>
        </Marker>
      )}
      {selected && (
        <Marker position={[selected.lat, selected.lng]} icon={starIcon()}>
          <Popup>{selected.name}</Popup>
        </Marker>
      )}
      {numbered.map((p, i) => {
        const cls = p.business_status === "CLOSED_PERMANENTLY" ? "red" : scoreClass(p.rating ? p.rating * 20 : null);
        return (
          <Marker key={p.place_id || i} position={[p.lat, p.lng]} icon={numIcon(i)}>
            <Popup>
              <b>{p.name}</b>
              <div className="muted">{p.address}</div>
              {p.rating != null && <div>★ {p.rating} ({p.user_rating_count ?? 0})</div>}
              <div>
                <span className={`score-pill ${cls}`}>
                  {p.business_status ?? "OPERATIONAL"}
                </span>
              </div>
            </Popup>
          </Marker>
        );
      })}
      {news.map((n, i) =>
        n.geo ? (
          <Marker key={i} position={[n.geo.lat, n.geo.lng]} icon={newsIcon(n.category ?? "general")}>
            <Popup>
              <b>{n.title}</b>
              {n.summary && <div className="muted">{n.summary}</div>}
            </Popup>
          </Marker>
        ) : null,
      )}
    </>
  );
}

function JourneyPosition() {
  const { journey } = useApp();
  if (!journey.active || !journey.position) return null;
  return (
    <CircleMarker center={[journey.position.lat, journey.position.lng]} radius={7} pathOptions={{ color: "#2196f3", fillColor: "#2196f3", fillOpacity: 1 }} />
  );
}

export default function MapView() {
  const { flyTo, userLoc, journey, ridePath } = useApp();
  const center: [number, number] = useMemo(() => {
    if (userLoc) return [userLoc.lat, userLoc.lng];
    return [12.9716, 77.5946];
  }, [userLoc]);

  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!mapRef.current) return;
    const pts: [number, number][] = [];
    if (journey.segments) {
      for (const seg of journey.segments.segments ?? []) {
        for (const opt of seg.options ?? []) {
          for (const pt of legGeometry(opt)) {
            const [la, ln] = pt;
            if (inBengaluru(la, ln)) pts.push(pt as [number, number]);
          }
        }
      }
    }
    if (ridePath && ridePath.length > 1) {
      for (const pt of ridePath) {
        const [la, ln] = pt;
        if (inBengaluru(la, ln)) pts.push(pt as [number, number]);
      }
    }
    if (pts.length) mapRef.current.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }, [journey.segments, ridePath]);

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="full-map"
      ref={(m) => { mapRef.current = m ?? null; }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyController target={flyTo} />
      <Pins />
      <NearbyRadius />
      <RoutePolylines />
      <JourneyPosition />
    </MapContainer>
  );
}
