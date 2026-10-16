// The STRATUM map: our own dark basemap (Natural Earth, India point of view), the B1
// persistent-contrail-condition grid for the chosen date/hour/flight level, flight tracks
// that brighten around the chosen hour, CoCiP-flagged segments, aircraft positions, the
// Delhi–Mumbai corridor, hover info and click-to-inspect. No external tiles or keys.
import {
  type ExpressionSpecification,
  type GeoJSONSource,
  type ImageSource,
  Map as MLMap,
  type MapMouseEvent,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "preact/hooks";
import type { FlaggedSegment, FlightFeature, Manifest } from "../data/contract";
import { clock } from "../data/format";

setWorkerUrl(workerUrl); // MapLibre 6 runs its worker from a separate module file

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export type Layers = { risk: boolean; flights: boolean; corridor: boolean; cities: boolean };

type Props = {
  manifest: Manifest;
  corridor: GeoJSON.Feature | null;
  riskImage: string | null; // data URL of the coloured grid
  flights: FlightFeature[] | null;
  segments: FlaggedSegment[];
  hour: number;
  selected: FlaggedSegment | null;
  picked: [number, number] | null;
  layers: Layers;
  onSelect: (s: FlaggedSegment | null) => void;
  onPick: (lngLat: [number, number] | null) => void;
  onHover?: (lngLat: [number, number] | null) => void;
};

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function palette() {
  const light = cssVar("color-scheme") === "light";
  return light
    ? { ocean: "#dfe7f2", land: "#f7f8fa", border: "#98a3b3", state: "#c3cad5", grat: "#c9d2df", coast: "#7e8a9c", track: "#334155", plane: "#111418", corr: "#7a4fc4", pred: "#e0730a", label: "#111418", halo: "#f7f8fa" }
    : { ocean: "#070a0f", land: "#121925", border: "#3a4558", state: "#232d3c", grat: "#141c28", coast: "#4a566b", track: "#e7eaf0", plane: "#ffffff", corr: "#c9a3ff", pred: "#ff8c1a", label: "#c9d1dd", halo: "#070a0f" };
}

function graticule(step = 5): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = [];
  for (let lon = 55; lon <= 110; lon += step) f.push({ type: "Feature", properties: { kind: "lon", v: lon }, geometry: { type: "LineString", coordinates: [[lon, -2], [lon, 46]] } });
  for (let lat = 0; lat <= 45; lat += step) f.push({ type: "Feature", properties: { kind: "lat", v: lat }, geometry: { type: "LineString", coordinates: [[55, lat], [110, lat]] } });
  return { type: "FeatureCollection", features: f };
}

/** Flight tracks → one 2-point feature per leg, with its mid-time in minutes after 00 UTC. */
function trackLegs(flights: FlightFeature[]): GeoJSON.FeatureCollection {
  const out: GeoJSON.Feature[] = [];
  flights.forEach((fl, i) => {
    const c = fl.geometry.coordinates;
    const m = fl.properties.minutes;
    for (let k = 0; k < c.length - 1; k++) {
      out.push({ type: "Feature", properties: { i, m: (m[k] + m[k + 1]) / 2 }, geometry: { type: "LineString", coordinates: [c[k], c[k + 1]] } });
    }
  });
  return { type: "FeatureCollection", features: out };
}

/** Aircraft positions at minute `t` (linear between track vertices). */
function planesAt(flights: FlightFeature[], t: number): GeoJSON.FeatureCollection {
  const out: GeoJSON.Feature[] = [];
  flights.forEach((fl, i) => {
    const m = fl.properties.minutes;
    const c = fl.geometry.coordinates;
    if (t < m[0] || t > m[m.length - 1]) return;
    let k = 0;
    while (k < m.length - 2 && m[k + 1] < t) k++;
    const a = m[k + 1] === m[k] ? 0 : (t - m[k]) / (m[k + 1] - m[k]);
    const lon = c[k][0] + a * (c[k + 1][0] - c[k][0]);
    const lat = c[k][1] + a * (c[k + 1][1] - c[k][1]);
    const brg = (Math.atan2(c[k + 1][0] - c[k][0], c[k + 1][1] - c[k][1]) * 180) / Math.PI;
    out.push({ type: "Feature", properties: { i, brg, flagged: fl.properties.flagged }, geometry: { type: "Point", coordinates: [lon, lat] } });
  });
  return { type: "FeatureCollection", features: out };
}

function segmentFeatures(segs: FlaggedSegment[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: segs.map((s) => ({
      type: "Feature",
      properties: { id: s.segment_id, m: clock(s.time_utc).minutes },
      geometry: { type: "LineString", coordinates: [[s.lon_start, s.lat_start], [s.lon_end, s.lat_end]] },
    })),
  };
}

function imageCoords(m: Manifest): [[number, number], [number, number], [number, number], [number, number]] {
  const g = m.grid;
  const h = g.step_deg / 2;
  return [
    [g.lon_west - h, g.lat_north + h],
    [g.lon_east + h, g.lat_north + h],
    [g.lon_east + h, g.lat_south - h],
    [g.lon_west - h, g.lat_south - h],
  ];
}

const CITY_LABELS = ["Delhi", "Mumbai", "Bengaluru", "Kolkata", "Chennai", "Hyderabad", "Ahmedabad", "Jaipur", "Lucknow", "Pune", "Nagpur", "Bhopal", "Patna", "Guwahati", "Karachi", "Lahore", "Dhaka", "Kochi", "Bhubaneswar", "Srinagar", "Indore", "Vishakhapatnam", "Kathmandu", "Colombo", "Yangon"];

export function ContrailMap(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef<Marker[]>([]);
  const tip = useRef<Popup | null>(null);
  const props = useRef(p);
  props.current = p;

  // create the map once
  useEffect(() => {
    const col = palette();
    const m = new MLMap({
      container: el.current!,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": col.ocean } }] },
      bounds: [
        [66, 5],
        [99, 37.5],
      ],
      fitBoundsOptions: { padding: 24 },
      maxBounds: [
        [45, -8],
        [120, 52],
      ],
      minZoom: 3,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false,
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
    m.touchZoomRotate.disableRotation();

    m.on("load", async () => {
      const [countries, states, cities] = await Promise.all(
        ["countries", "india_states", "cities"].map((n) => fetch(`${BASE}/geo/${n}.geojson`).then((r) => r.json())),
      );
      m.addSource("countries", { type: "geojson", data: countries });
      m.addSource("states", { type: "geojson", data: states });
      m.addSource("grat", { type: "geojson", data: graticule() });
      m.addSource("risk", { type: "image", url: transparentPng(), coordinates: imageCoords(props.current.manifest) });
      m.addSource("corridor", { type: "geojson", data: EMPTY });
      m.addSource("legs", { type: "geojson", data: EMPTY });
      m.addSource("flagged", { type: "geojson", data: EMPTY });
      m.addSource("planes", { type: "geojson", data: EMPTY });
      m.addSource("selected", { type: "geojson", data: EMPTY });
      m.addSource("pick", { type: "geojson", data: EMPTY });

      m.addLayer({ id: "land", type: "fill", source: "countries", paint: { "fill-color": col.land } });
      m.addLayer({ id: "grat", type: "line", source: "grat", paint: { "line-color": col.grat, "line-width": 1 } });
      m.addLayer({ id: "risk", type: "raster", source: "risk", paint: { "raster-resampling": "linear", "raster-fade-duration": 0, "raster-opacity": 1 } });
      m.addLayer({ id: "states", type: "line", source: "states", paint: { "line-color": col.state, "line-width": 0.7 } });
      m.addLayer({ id: "borders", type: "line", source: "countries", paint: { "line-color": col.border, "line-width": 1 } });
      m.addLayer({ id: "corridor-fill", type: "fill", source: "corridor", paint: { "fill-color": col.corr, "fill-opacity": 0.06 } });
      m.addLayer({ id: "corridor-line", type: "line", source: "corridor", paint: { "line-color": col.corr, "line-width": 1.4, "line-dasharray": [3, 3] } });
      m.addLayer({ id: "legs", type: "line", source: "legs", layout: { "line-cap": "round" }, paint: { "line-color": col.track, "line-width": 1.1, "line-opacity": 0.15 } });
      m.addLayer({ id: "flagged-glow", type: "line", source: "flagged", layout: { "line-cap": "round" }, paint: { "line-color": col.pred, "line-width": 9, "line-blur": 7, "line-opacity": 0.35 } });
      m.addLayer({ id: "flagged", type: "line", source: "flagged", layout: { "line-cap": "round" }, paint: { "line-color": col.pred, "line-width": 2.6 } });
      m.addLayer({ id: "selected-glow", type: "line", source: "selected", layout: { "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 14, "line-blur": 8, "line-opacity": 0.5 } });
      m.addLayer({ id: "selected", type: "line", source: "selected", layout: { "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 3 } });
      m.addLayer({ id: "planes-halo", type: "circle", source: "planes", paint: { "circle-radius": 6, "circle-color": col.ocean, "circle-opacity": 0.6 } });
      m.addLayer({ id: "planes", type: "circle", source: "planes", paint: { "circle-radius": 2.6, "circle-color": ["case", ["get", "flagged"], col.pred, col.plane] } });
      m.addLayer({ id: "pick", type: "circle", source: "pick", paint: { "circle-radius": 7, "circle-color": "transparent", "circle-stroke-color": "#29d3ff", "circle-stroke-width": 2 } });

      // city labels as HTML markers (crisp, no glyph server needed)
      const want = new Set(CITY_LABELS);
      for (const f of (cities as GeoJSON.FeatureCollection).features) {
        const name = String(f.properties?.name);
        if (!want.has(name)) continue;
        const d = document.createElement("div");
        d.className = `city${name === "Delhi" || name === "Mumbai" ? " hub" : ""}`;
        d.innerHTML = `<i></i><span>${name === "Delhi" ? "DEL · Delhi" : name === "Mumbai" ? "BOM · Mumbai" : name}</span>`;
        markers.current.push(new Marker({ element: d, anchor: "left" }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).addTo(m));
      }

      // hover: flight info
      tip.current = new Popup({ closeButton: false, closeOnClick: false, className: "map-tip", offset: 10 });
      const onMove = (e: MapMouseEvent) => {
        props.current.onHover?.([e.lngLat.lng, e.lngLat.lat]);
        const hits = m.queryRenderedFeatures([[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]], { layers: ["flagged", "legs", "planes"] });
        const fl = props.current.flights;
        if (!hits.length || !fl) {
          tip.current!.remove();
          m.getCanvas().style.cursor = "";
          return;
        }
        const h = hits[0];
        m.getCanvas().style.cursor = "pointer";
        if (h.layer.id === "flagged") {
          const s = props.current.segments.find((x) => x.segment_id === h.properties.id);
          if (s) tip.current!.setLngLat(e.lngLat).setHTML(tipHtml(s.callsign, s.airline, `FL${s.fl} · ${clock(s.time_utc).utc} UTC`, "Persistent contrail (B1)")).addTo(m);
          return;
        }
        const f = fl[Number(h.properties.i)];
        if (f) {
          const t = h.properties.m !== undefined ? `${fmtMin(Number(h.properties.m))} UTC` : "";
          tip.current!.setLngLat(e.lngLat).setHTML(tipHtml(f.properties.callsign, f.properties.airline, [f.properties.aircraft_type, t].filter(Boolean).join(" · "), f.properties.flagged ? "Makes a persistent contrail (B1)" : null)).addTo(m);
        }
      };
      m.on("mousemove", onMove);
      m.on("mouseout", () => {
        tip.current?.remove();
        props.current.onHover?.(null);
      });
      m.on("click", (e: MapMouseEvent) => {
        const hits = m.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ["flagged"] });
        if (hits.length) {
          const s = props.current.segments.find((x) => x.segment_id === hits[0].properties.id);
          if (s) return props.current.onSelect(s);
        }
        props.current.onPick([e.lngLat.lng, e.lngLat.lat]);
      });

      ready.current = true;
      sync(m, props.current);
    });

    // re-colour when the theme changes
    const mo = new MutationObserver(() => ready.current && recolour(m));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onMq = () => ready.current && recolour(m);
    mq.addEventListener("change", onMq);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", onMq);
      markers.current.forEach((k) => k.remove());
      m.remove();
    };
  }, []);

  useEffect(() => {
    if (map.current && ready.current) sync(map.current, p);
  });

  // fly to a newly selected segment
  useEffect(() => {
    const m = map.current;
    if (!m || !p.selected) return;
    m.flyTo({ center: [p.selected.lon, p.selected.lat], zoom: Math.max(m.getZoom(), 5.6), speed: 1.2 });
  }, [p.selected?.segment_id]);

  return <div ref={el} class="map-canvas" role="region" aria-label="Map of contrail conditions and flights over India" />;
}

function sync(m: MLMap, p: Props) {
  const vis = (id: string, on: boolean) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  vis("risk", p.layers.risk);
  ["legs", "planes", "planes-halo", "flagged", "flagged-glow"].forEach((id) => vis(id, p.layers.flights));
  ["corridor-fill", "corridor-line"].forEach((id) => vis(id, p.layers.corridor));
  document.querySelectorAll<HTMLElement>(".city").forEach((d) => (d.style.display = p.layers.cities ? "" : "none"));

  const risk = m.getSource("risk") as ImageSource | undefined;
  if (risk && p.riskImage && risk.url !== p.riskImage) risk.updateImage({ url: p.riskImage, coordinates: imageCoords(p.manifest) });
  if (risk && !p.riskImage) risk.updateImage({ url: transparentPng(), coordinates: imageCoords(p.manifest) });

  const setData = (id: string, d: GeoJSON.FeatureCollection | GeoJSON.Feature) => (m.getSource(id) as GeoJSONSource | undefined)?.setData(d);
  const key = (m as unknown as { __keys?: Record<string, unknown> }).__keys ?? ((m as unknown as { __keys: Record<string, unknown> }).__keys = {});
  if (key.corridor !== p.corridor) {
    key.corridor = p.corridor;
    setData("corridor", p.corridor ?? EMPTY);
  }
  if (key.flights !== p.flights) {
    key.flights = p.flights;
    setData("legs", p.flights ? trackLegs(p.flights) : EMPTY);
  }
  if (key.segments !== p.segments) {
    key.segments = p.segments;
    setData("flagged", segmentFeatures(p.segments));
  }
  const t = p.hour * 60 + 30;
  if (key.t !== t || key.planesFor !== p.flights) {
    key.t = t;
    key.planesFor = p.flights;
    setData("planes", p.flights ? planesAt(p.flights, t) : EMPTY);
    const near: ExpressionSpecification = ["abs", ["-", ["get", "m"], t]];
    m.setPaintProperty("legs", "line-opacity", ["case", ["<=", near, 30], 0.95, ["<=", near, 90], 0.42, 0.13] as ExpressionSpecification);
    m.setPaintProperty("flagged", "line-opacity", ["case", ["<=", near, 60], 1, 0.45] as ExpressionSpecification);
  }
  setData("selected", p.selected ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[p.selected.lon_start, p.selected.lat_start], [p.selected.lon_end, p.selected.lat_end]] } } : EMPTY);
  setData("pick", p.picked ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p.picked } } : EMPTY);
}

function recolour(m: MLMap) {
  const c = palette();
  m.setPaintProperty("bg", "background-color", c.ocean);
  m.setPaintProperty("land", "fill-color", c.land);
  m.setPaintProperty("grat", "line-color", c.grat);
  m.setPaintProperty("states", "line-color", c.state);
  m.setPaintProperty("borders", "line-color", c.border);
  m.setPaintProperty("corridor-line", "line-color", c.corr);
  m.setPaintProperty("corridor-fill", "fill-color", c.corr);
  m.setPaintProperty("legs", "line-color", c.track);
  m.setPaintProperty("planes", "circle-color", ["case", ["get", "flagged"], c.pred, c.plane]);
  m.setPaintProperty("planes-halo", "circle-color", c.ocean);
}

let blank: string | null = null;
function transparentPng(): string {
  if (blank) return blank;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  blank = c.toDataURL();
  return blank;
}

const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
function tipHtml(callsign: string, airline: string | null, line2: string, line3: string | null) {
  return `<b>${esc(callsign)}</b>${airline ? `<span>${esc(airline)}</span>` : ""}<em>${esc(line2)}</em>${line3 ? `<strong>${esc(line3)}</strong>` : ""}`;
}
