import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Coord, LatLng, LiveContext, NewsItem, PlaceDetails, PlaceResult, QuickPlan, RidePrice, SegmentResponse, TripInputData, WeatherNow } from "../types";

export type Mode = "search" | "atob" | "trip";

export interface NearbyBase {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface JourneyState {
  segments: SegmentResponse | null;
  chosenLegs: unknown[];
  active: boolean;
  position: LatLng | null;
}

interface AppState {
  mode: Mode;
  setMode: (m: Mode) => void;
  dark: boolean;
  toggleDark: () => void;

  userLoc: LatLng | null;
  setUserLoc: (p: LatLng | null) => void;

  source: LatLng | null;
  dest: LatLng | null;
  setSource: (p: LatLng | null) => void;
  setDest: (p: LatLng | null) => void;
  swap: () => void;

  weather: WeatherNow | null;
  setWeather: (w: WeatherNow | null) => void;

  places: PlaceResult[];
  setPlaces: (p: PlaceResult[]) => void;
  searchResults: PlaceResult[];
  setSearchResults: (p: PlaceResult[]) => void;
  hoveredPlaceId: string | null;
  setHoveredPlaceId: (id: string | null) => void;
  pinned: PlaceResult | null;
  setPinned: (p: PlaceResult | null) => void;
  searching: boolean;
  setSearching: (v: boolean) => void;
  searched: boolean;
  setSearched: (v: boolean) => void;
  radiusKm: number;
  setRadiusKm: (v: number) => void;
  selected: PlaceDetails | null;
  setSelected: (p: PlaceDetails | null) => void;
  showDiscovery: boolean;
  setShowDiscovery: (v: boolean) => void;

  prices: RidePrice[];
  setPrices: (p: RidePrice[]) => void;
  fuel: number | null;
  setFuel: (f: number | null) => void;
  quickPlans: QuickPlan[];
  setQuickPlans: (p: QuickPlan[]) => void;
  nearbyBase: NearbyBase | null;
  setNearbyBase: (b: NearbyBase | null) => void;
  clearTransient: () => void;

  ridePath: Coord[] | null;
  setRidePath: (p: Coord[] | null) => void;

  flowOpen: boolean;
  setFlowOpen: (v: boolean) => void;
  flowParams: { groupSize: number; budget: number };
  setFlowParams: (p: { groupSize: number; budget: number }) => void;

  news: NewsItem[];
  setNews: (n: NewsItem[]) => void;

  journey: JourneyState;
  setJourney: (j: Partial<JourneyState>) => void;

  trip: TripInputData | null;
  setTrip: (t: TripInputData | null) => void;

  flyTo: LatLng | null;
  setFlyTo: (p: LatLng | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("search");
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [source, setSource] = useState<LatLng | null>(null);
  const [dest, setDest] = useState<LatLng | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PlaceResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [radiusKm, setRadiusKm] = useState(2);
  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [prices, setPrices] = useState<RidePrice[]>([]);
  const [fuel, setFuel] = useState<number | null>(null);
  const [quickPlans, setQuickPlans] = useState<QuickPlan[]>([]);
  const [nearbyBase, setNearbyBase] = useState<NearbyBase | null>(null);
  const [ridePath, setRidePath] = useState<Coord[] | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowParams, setFlowParams] = useState({ groupSize: 1, budget: 500 });
  const [news, setNews] = useState<NewsItem[]>([]);
  const [journey, setJourneyState] = useState<JourneyState>({
    segments: null,
    chosenLegs: [],
    active: false,
    position: null,
  });
  const [trip, setTrip] = useState<TripInputData | null>(null);
  const [flyTo, setFlyTo] = useState<LatLng | null>(null);

  const toggleDark = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  const setJourney = (patch: Partial<JourneyState>) => setJourneyState((j) => ({ ...j, ...patch }));

  const swap = () => {
    setSource(dest);
    setDest(source);
  };

  const clearTransient = () => {
    setPlaces([]);
    setSearchResults([]);
    setSearched(false);
    setPinned(null);
    setSelected(null);
    setShowDiscovery(false);
    setPrices([]);
    setFuel(null);
    setQuickPlans([]);
    setNearbyBase(null);
    setRidePath(null);
    setFlyTo(null);
    setFlowOpen(false);
    setJourney({ segments: null, chosenLegs: [], active: false, position: null });
  };

  const value = useMemo<AppState>(() => ({
    mode, setMode, dark, toggleDark,
    userLoc, setUserLoc,
    source, dest, setSource, setDest, swap,
    weather, setWeather,
    places, setPlaces,
    searchResults, setSearchResults, hoveredPlaceId, setHoveredPlaceId,
    pinned, setPinned,
    searching, setSearching, searched, setSearched, radiusKm, setRadiusKm,
    selected, setSelected, showDiscovery, setShowDiscovery,
    prices, setPrices, fuel, setFuel, quickPlans, setQuickPlans,
    nearbyBase, setNearbyBase, clearTransient,
    ridePath, setRidePath,
    flowOpen, setFlowOpen, flowParams, setFlowParams,
    news, setNews,
    journey, setJourney,
    trip, setTrip,
    flyTo, setFlyTo,
  }), [mode, dark, userLoc, source, dest, weather, places, searchResults, pinned, selected, showDiscovery,
      prices, fuel, quickPlans, nearbyBase, ridePath, flowOpen, flowParams, news, journey, trip, flyTo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function scoreClass(score: number | null | undefined): "green" | "yellow" | "orange" | "red" {
  if (score == null) return "yellow";
  if (score >= 70) return "green";
  if (score >= 50) return "yellow";
  if (score >= 30) return "orange";
  return "red";
}
