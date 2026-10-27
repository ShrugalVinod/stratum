// The live advice map (/now): the same chart basemap as the main map, the forecast's
// lasting-contrail air for the hour shown, airliners that move (dead reckoning, or along their
// planned route when replaying the next hours), a pulse around each one with an alert, and for
// the chosen one its cruise ahead: orange where it would leave a lasting contrail, teal dashed
// where it would fly the advised level instead.
import { type GeoJSONSource, type ImageSource, Map as MLMap, type MapMouseEvent, Marker, NavigationControl, Popup, ScaleControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "preact/hooks";
import type { Manifest } from "../data/contract";
import { CITY_LABELS, graticule, imageCoords, palette, planeIcon, reducedMotion, transparentPng } from "./ContrailMap";

setWorkerUrl(workerUrl);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const FADE_MS = 600; // the shading cross-fades from one hour to the next
const PULSE_MS = 1800;
const RISK_OPACITY = 0.9;

type Props = {
  manifest: Manifest;
  /** the coloured lasting-contrail grid for the hour shown (data URL) */
  risk: string | null;
  /** the aircraft now: Point features with {id, brg, alert, sel} */
  frame: () => GeoJSON.FeatureCollection;
  /** LineStrings with {kind: "ahead" | "lasting" | "advised"} */
  lines: GeoJSON.FeatureCollection;
  /** fly to this point when it changes */
  focus: [number, number] | null;
  onSelect: (id: string | null) => void;
  /** hover text for an aircraft (HTML), or null */
  tip: (id: string) => string | null;
  label: string;
};

export function NowMap(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    const col = palette();
    const still = reducedMotion();
    const m = new MLMap({
      container: el.current!,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": col.ocean } }] },
      center: [82, 21],
      zoom: 3.6,
      maxBounds: [
        [45, -8],
        [120, 52],
      ],
      minZoom: 2.5,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.current = m;
    if (import.meta.env.DEV) (window as unknown as { __nowmap: MLMap }).__nowmap = m;
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
    m.touchZoomRotate.disableRotation();
    const markers: Marker[] = [];
    let raf = 0;

    m.on("load", async () => {
      const [countries, states, cities] = await Promise.all(["countries", "india_states", "cities"].map((n) => fetch(`${BASE}/geo/${n}.geojson`).then((r) => r.json())));
      m.addSource("countries", { type: "geojson", data: countries });
      m.addSource("states", { type: "geojson", data: states });
      m.addSource("grat", { type: "geojson", data: graticule() });
      // two copies of the shading, so one hour can fade into the next
      m.addSource("riskA", { type: "image", url: props.current.risk ?? transparentPng(), coordinates: imageCoords(props.current.manifest) });
      m.addSource("riskB", { type: "image", url: transparentPng(), coordinates: imageCoords(props.current.manifest) });
      m.addSource("lines", { type: "geojson", data: props.current.lines });
      m.addSource("planes", { type: "geojson", data: EMPTY });

      m.addLayer({ id: "land", type: "fill", source: "countries", paint: { "fill-color": col.land } });
      m.addLayer({ id: "grat", type: "line", source: "grat", paint: { "line-color": col.grat, "line-width": 1 } });
      m.addLayer({ id: "riskA", type: "raster", source: "riskA", paint: { "raster-resampling": "linear", "raster-fade-duration": 0, "raster-opacity": RISK_OPACITY } });
      m.addLayer({ id: "riskB", type: "raster", source: "riskB", paint: { "raster-resampling": "linear", "raster-fade-duration": 0, "raster-opacity": 0 } });
      m.addLayer({ id: "states", type: "line", source: "states", paint: { "line-color": col.state, "line-width": 0.7 } });
      m.addLayer({ id: "borders", type: "line", source: "countries", paint: { "line-color": col.border, "line-width": 1 } });
      m.addLayer({ id: "ahead", type: "line", source: "lines", filter: ["==", ["get", "kind"], "ahead"], layout: { "line-cap": "round" }, paint: { "line-color": col.track, "line-width": 1.6, "line-opacity": 0.55, "line-dasharray": [1, 2] } });
      m.addLayer({ id: "lasting-glow", type: "line", source: "lines", filter: ["==", ["get", "kind"], "lasting"], layout: { "line-cap": "round" }, paint: { "line-color": col.pred, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 10, 7, 18], "line-blur": ["interpolate", ["linear"], ["zoom"], 4, 7, 7, 12], "line-opacity": 0.45 } });
      m.addLayer({ id: "lasting", type: "line", source: "lines", filter: ["==", ["get", "kind"], "lasting"], layout: { "line-cap": "round" }, paint: { "line-color": col.pred, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 7, 4] } });
      m.addLayer({ id: "advised", type: "line", source: "lines", filter: ["==", ["get", "kind"], "advised"], layout: { "line-cap": "butt" }, paint: { "line-color": cssVar("--teal"), "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 7, 4], "line-dasharray": [2, 1.4], "line-offset": ["interpolate", ["linear"], ["zoom"], 4, 5, 7, 9] } });
      m.addLayer({ id: "pulse", type: "circle", source: "planes", filter: ["get", "alert"], paint: { "circle-radius": 6, "circle-color": "transparent", "circle-stroke-color": col.pred, "circle-stroke-width": 1.6, "circle-stroke-opacity": 0.7 } });
      m.addImage("plane", planeIcon(), { sdf: true, pixelRatio: 2 });
      m.addLayer({
        id: "planes",
        type: "symbol",
        source: "planes",
        layout: {
          "icon-image": "plane",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, ["case", ["get", "sel"], 0.85, 0.5], 6, ["case", ["get", "sel"], 1.3, 0.85], 8, 1.2],
          "icon-rotate": ["get", "brg"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-sort-key": ["case", ["get", "sel"], 2, ["get", "alert"], 1, 0],
        },
        paint: { "icon-color": planeColour(col), "icon-halo-color": col.land, "icon-halo-width": 1.2, "icon-halo-blur": 0.4 },
      });

      const want = new Set(CITY_LABELS);
      for (const f of (cities as GeoJSON.FeatureCollection).features) {
        const name = String(f.properties?.name);
        if (!want.has(name)) continue;
        const d = document.createElement("div");
        d.className = "city";
        d.innerHTML = `<i></i><span>${name}</span>`;
        markers.push(new Marker({ element: d, anchor: "left" }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).addTo(m));
      }

      const tip = new Popup({ closeButton: false, closeOnClick: false, className: "map-tip", offset: 12 });
      const hit = (e: MapMouseEvent) => m.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ["planes"] })[0];
      m.on("mousemove", (e) => {
        const h = hit(e);
        const html = h ? props.current.tip(String(h.properties.id)) : null;
        m.getCanvas().style.cursor = html ? "pointer" : "";
        if (html) tip.setLngLat(e.lngLat).setHTML(html).addTo(m);
        else tip.remove();
      });
      m.on("mouseout", () => tip.remove());
      m.on("click", (e) => {
        const h = hit(e);
        props.current.onSelect(h ? String(h.properties.id) : null);
      });

      ready.current = true;
      el.current?.classList.add("ready");
      m.fitBounds([[67, 6], [98, 36.5]], { padding: 16, duration: still ? 0 : 1600 });

      // planes move every frame; alert rings pulse (still rings for people who prefer less motion)
      const loop = (now: number) => {
        (m.getSource("planes") as GeoJSONSource | undefined)?.setData(props.current.frame());
        if (!still) {
          const k = (now % PULSE_MS) / PULSE_MS;
          m.setPaintProperty("pulse", "circle-radius", 6 + 14 * k);
          m.setPaintProperty("pulse", "circle-stroke-opacity", 0.8 * (1 - k));
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });

    const onTheme = () => {
      if (!ready.current) return;
      const c = palette();
      m.setPaintProperty("bg", "background-color", c.ocean);
      m.setPaintProperty("land", "fill-color", c.land);
      m.setPaintProperty("grat", "line-color", c.grat);
      m.setPaintProperty("states", "line-color", c.state);
      m.setPaintProperty("borders", "line-color", c.border);
      m.setPaintProperty("ahead", "line-color", c.track);
      m.setPaintProperty("lasting", "line-color", c.pred);
      m.setPaintProperty("lasting-glow", "line-color", c.pred);
      m.setPaintProperty("advised", "line-color", cssVar("--teal"));
      m.setPaintProperty("pulse", "circle-stroke-color", c.pred);
      m.setPaintProperty("planes", "icon-color", planeColour(c));
      m.setPaintProperty("planes", "icon-halo-color", c.land);
    };
    addEventListener("stratum-theme", onTheme);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("stratum-theme", onTheme);
      markers.forEach((k) => k.remove());
      m.remove();
    };
  }, []);

  // a new hour (or level) of shading fades in over the old one
  const front = useRef<"riskA" | "riskB">("riskA");
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const back = front.current === "riskA" ? "riskB" : "riskA";
    const was = front.current;
    (m.getSource(back) as ImageSource).updateImage({ url: p.risk ?? transparentPng(), coordinates: imageCoords(p.manifest) });
    front.current = back;
    const t0 = performance.now();
    const ms = reducedMotion() ? 0 : FADE_MS;
    let raf = 0;
    const step = (now: number) => {
      const k = ms ? Math.min(1, (now - t0) / ms) : 1;
      m.setPaintProperty(back, "raster-opacity", RISK_OPACITY * k);
      m.setPaintProperty(was, "raster-opacity", RISK_OPACITY * (1 - k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [p.risk]);

  useEffect(() => {
    if (ready.current) (map.current?.getSource("lines") as GeoJSONSource | undefined)?.setData(p.lines);
  }, [p.lines]);

  useEffect(() => {
    const m = map.current;
    if (m && ready.current && p.focus) m.easeTo({ center: p.focus, zoom: Math.max(m.getZoom(), 5), duration: reducedMotion() ? 0 : 1200, easing: (t) => 1 - (1 - t) ** 3 });
  }, [p.focus?.[0], p.focus?.[1]]);

  return <div ref={el} class="map-canvas" role="region" aria-label={p.label} />;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const planeColour = (c: ReturnType<typeof palette>) => ["case", ["get", "sel"], c.head, ["get", "alert"], c.pred, c.plane] as never;
