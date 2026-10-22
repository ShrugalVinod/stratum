import { useEffect, useRef, useState } from "preact/hooks";
import type * as THREE_NS from "three";
import type { FlaggedSegment, Manifest } from "../data/contract";
import { currentBuild, layerUrl, loadDay, loadGridBytes, loadManifest, spriteHour } from "../data/load";
import "../styles/map.css";

/** /3d — the humid layers in three dimensions: for one hour, every 0.5° column of the study
 *  domain at each dashboard flight level where a layer (physics B1 / B3: share of the hour with
 *  persistent-contrail conditions; STRATUM: probability) is high, drawn as a translucent block,
 *  with the day's flagged flight portions as lines at their flight level. Height is exaggerated
 *  ~100×. three.js is loaded only on this page. */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const Y_PER_FL = 0.045; // scene units (≈ degrees) per flight level: FL280–FL420 → 6.3 units tall
const FL0 = 260;
const LAYERS = [
  { id: "B1", label: "Physics", title: "Raw ERA5 physics: share of the hour with persistent-contrail conditions", min: 0.34 },
  { id: "B3", label: "Published fix", title: "The published humidity correction: share of the hour with persistent-contrail conditions", min: 0.34 },
  { id: "STRATUM", label: "STRATUM", title: "STRATUM's probability of a satellite-visible persistent contrail (strong = 8 % or more)", min: 0.25 },
] as const;
type LayerId = (typeof LAYERS)[number]["id"];

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
const yOf = (fl: number) => (fl - FL0) * Y_PER_FL;

export function Sky3D() {
  const box = useRef<HTMLDivElement>(null);
  const three = useRef<{ T: typeof THREE_NS; scene: THREE_NS.Scene; voxels: THREE_NS.Group; tracks: THREE_NS.Group; render: () => void } | null>(null);
  const [man, setMan] = useState<Manifest | null>(null);
  const [build, setBuild] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [hour, setHour] = useState(6);
  const [layer, setLayer] = useState<LayerId>("B1");
  const [segs, setSegs] = useState<FlaggedSegment[]>([]);
  const [play, setPlay] = useState(false);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    Promise.all([loadManifest(), currentBuild()])
      .then(([{ manifest }, b]) => {
        setMan(manifest);
        setBuild(b);
        const d = q.get("date");
        setDate(d && manifest.days.includes(d) ? d : (manifest.days_with_flights[0] ?? manifest.days[0]));
        const h = Number(q.get("hour"));
        if (Number.isInteger(h) && h >= 0 && h < 24) setHour(h);
        const l = q.get("layer");
        if (l && LAYERS.some((x) => x.id === l)) setLayer(l as LayerId);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  // the scene (once)
  useEffect(() => {
    if (!man || !box.current) return;
    let stop = false;
    let cleanup = () => {};
    Promise.all([import("three"), import("three/examples/jsm/controls/OrbitControls.js"), fetch(`${BASE}/geo/countries.geojson`).then((r) => r.json())]).then(([T, { OrbitControls }, countries]) => {
      if (stop || !box.current) return;
      const el = box.current;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      el.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const g = man.grid;
      const cx = (g.lon_west + g.lon_east) / 2;
      const cz = -(g.lat_north + g.lat_south) / 2;
      const camera = new T.PerspectiveCamera(40, 1, 0.1, 500);
      // a narrow (phone) screen needs the camera further back to fit India
      const far = el.clientWidth < el.clientHeight ? 1.9 : 1;
      camera.position.set(cx - 4, 26 * far, cz + 40 * far);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(cx, 2, cz);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minDistance = 8;
      controls.maxDistance = 120;
      // the ground: country outlines clipped to a little beyond the domain
      const pts: number[] = [];
      const inBox = (lon: number, lat: number) => lon > g.lon_west - 3 && lon < g.lon_east + 3 && lat > g.lat_south - 3 && lat < g.lat_north + 3;
      const ring = (r: number[][]) => {
        for (let i = 1; i < r.length; i++) if (inBox(r[i - 1][0], r[i - 1][1]) || inBox(r[i][0], r[i][1])) pts.push(r[i - 1][0], 0, -r[i - 1][1], r[i][0], 0, -r[i][1]);
      };
      for (const f of countries.features as GeoJSON.Feature[]) {
        const geom = f.geometry;
        if (geom.type === "Polygon") geom.coordinates.forEach(ring);
        else if (geom.type === "MultiPolygon") geom.coordinates.forEach((p) => p.forEach(ring));
      }
      const lineGeo = new T.BufferGeometry();
      lineGeo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
      scene.add(new T.LineSegments(lineGeo, new T.LineBasicMaterial({ color: css("--ink"), transparent: true, opacity: 0.55 })));
      const plate = new T.Mesh(
        new T.PlaneGeometry(g.lon_east - g.lon_west, g.lat_north - g.lat_south),
        new T.MeshBasicMaterial({ color: css("--map-ocean"), transparent: true, opacity: 0.35, side: T.DoubleSide }),
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(cx, -0.01, cz);
      scene.add(plate);
      // flight-level ticks on one corner post
      const ticks: number[] = [];
      for (const f of man.flight_levels) ticks.push(g.lon_west, yOf(f.fl), -g.lat_south, g.lon_west + 0.8, yOf(f.fl), -g.lat_south);
      ticks.push(g.lon_west, 0, -g.lat_south, g.lon_west, yOf(man.flight_levels[man.flight_levels.length - 1].fl), -g.lat_south);
      const tg = new T.BufferGeometry();
      tg.setAttribute("position", new T.Float32BufferAttribute(ticks, 3));
      scene.add(new T.LineSegments(tg, new T.LineBasicMaterial({ color: css("--muted") })));
      // their labels (canvas sprites)
      for (const f of man.flight_levels.filter((_, i, a) => i === 0 || i === a.length - 1 || i === Math.floor(a.length / 2))) {
        const cv = document.createElement("canvas");
        cv.width = 192;
        cv.height = 64;
        const cx2 = cv.getContext("2d")!;
        cx2.font = "600 34px 'Martian Mono Variable', monospace";
        cx2.fillStyle = css("--ink");
        cx2.fillText(`FL${f.fl}`, 4, 44);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthWrite: false }));
        sp.scale.set(2.4, 0.8, 1);
        sp.position.set(g.lon_west - 1.6, yOf(f.fl), -g.lat_south);
        scene.add(sp);
      }
      const voxels = new T.Group();
      const tracks = new T.Group();
      scene.add(voxels, tracks);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
      three.current = { T, scene, voxels, tracks, render: () => renderer.render(scene, camera) };
      setReady(true);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        el.removeChild(renderer.domElement);
      };
    });
    return () => {
      stop = true;
      cleanup();
      three.current = null;
    };
  }, [man]);

  // the day's flagged portions
  useEffect(() => {
    if (!build || !date) return;
    loadDay(build, date)
      .then((d) => setSegs(d.lists.STRATUM?.length ? d.lists.STRATUM : (d.lists.B1 ?? [])))
      .catch(() => setSegs([]));
  }, [build, date]);

  // voxels for the hour
  useEffect(() => {
    const t3 = three.current;
    if (!t3 || !man || !date || !ready) return;
    const info = man.layers?.find((l) => l.id === layer);
    if (!info) return;
    let alive = true;
    const g = man.grid;
    const min = LAYERS.find((l) => l.id === layer)!.min;
    Promise.all(man.flight_levels.map((f) => loadGridBytes(layerUrl(build, date, info.file, f.fl)).then((s) => [f.fl, spriteHour(s, hour, g.cols)] as const))).then((grids) => {
      if (!alive) return;
      const { T, voxels } = t3;
      voxels.clear();
      const step = 2; // 0.5° columns
      const geo = new T.BoxGeometry(g.step_deg * step * 0.92, Y_PER_FL * 20 * 0.85, g.step_deg * step * 0.92);
      const low = new T.Color(css("--teal"));
      const high = new T.Color(css("--orange"));
      const bins = [0, 1, 2, 3].map((k) => ({ k, items: [] as number[][] }));
      for (const [fl, v] of grids) {
        for (let r = 0; r + step <= g.rows; r += step)
          for (let c = 0; c + step <= g.cols; c += step) {
            let s = 0;
            for (let i = 0; i < step; i++) for (let j = 0; j < step; j++) s += v[(r + i) * g.cols + c + j];
            const val = (s / (step * step) / 255) * info.full_scale;
            const rel = layer === "STRATUM" ? val / 0.1 : val; // STRATUM: 10 % is already a high probability
            if (rel < min) continue;
            const bin = Math.min(3, Math.floor(((rel - min) / (1 - min)) * 4));
            bins[bin].items.push([g.lon_west + (c + step / 2 - 0.5) * g.step_deg, yOf(fl), -(g.lat_north - (r + step / 2 - 0.5) * g.step_deg)]);
          }
      }
      let n = 0;
      const m = new T.Matrix4();
      for (const b of bins) {
        if (!b.items.length) continue;
        const mat = new T.MeshBasicMaterial({ color: low.clone().lerp(high, b.k / 3), transparent: true, opacity: 0.22 + 0.16 * b.k, depthWrite: false });
        const mesh = new T.InstancedMesh(geo, mat, b.items.length);
        b.items.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])));
        voxels.add(mesh);
        n += b.items.length;
      }
      setCount(n);
    });
    return () => {
      alive = false;
    };
  }, [ready, man, build, date, hour, layer]);

  // flagged portions: those flown within ±1 h of the chosen hour stand out
  useEffect(() => {
    const t3 = three.current;
    if (!t3 || !ready) return;
    const { T, tracks } = t3;
    tracks.clear();
    const near: number[] = [];
    const far: number[] = [];
    for (const s of segs) {
      const h = Number(s.time_utc.slice(11, 13));
      const arr = Math.abs(h - hour) <= 1 ? near : far;
      const y = yOf(s.fl);
      arr.push(s.lon_start, y, -s.lat_start, s.lon_end, y, -s.lat_end);
    }
    for (const [arr, op] of [
      [far, 0.18],
      [near, 1],
    ] as const) {
      if (!arr.length) continue;
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
      tracks.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: css("--red"), transparent: true, opacity: op })));
    }
  }, [ready, segs, hour]);

  useEffect(() => {
    if (!play) return;
    const t = setInterval(() => setHour((h) => (h + 1) % 24), 1100);
    return () => clearInterval(t);
  }, [play]);

  useEffect(() => {
    if (!man || !date) return;
    history.replaceState(null, "", `/3d?date=${date}&hour=${hour}&layer=${layer}`);
  }, [man, date, hour, layer]);

  const avail = LAYERS.filter((l) => man?.layers?.some((x) => x.id === l.id));
  return (
    <div class="sky3d">
      <div class="s3-bar mp-bar" role="toolbar" aria-label="3D view controls">
        <h1 class="mp-title mono-s">Humid layers in 3D · height ×100</h1>
        <span class="mp-tools">
          <span class="seg-ctl" role="radiogroup" aria-label="Layer">
            {avail.map((l) => (
              <button role="radio" aria-checked={layer === l.id} class={layer === l.id ? "on" : ""} title={l.title} onClick={() => setLayer(l.id)}>
                {l.label}
              </button>
            ))}
          </span>
          {man && date && (
            <label class="date-pick">
              <span class="sr-only">Date</span>
              <select value={date} onChange={(e) => setDate((e.target as HTMLSelectElement).value)}>
                {man.days.map((d) => (
                  <option value={d}>
                    {d}
                    {man.days_with_flights.includes(d) ? " ✈" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a class="tool" href={`/map?date=${date ?? ""}&hour=${hour}`}>
            2D map
          </a>
        </span>
      </div>
      <div class="s3-stage" ref={box}>
        {err && <p class="muted mono s3-msg">{err}</p>}
        {!ready && !err && <p class="muted mono s3-msg">Building the sky…</p>}
        <div class="s3-key mono-s">
          <span>
            <i class="k-low" /> layer present
          </span>
          <span>
            <i class="k-high" /> strong
          </span>
          <span>
            <i class="k-seg" /> flagged flight portions ({segs.length})
          </span>
          <span class="muted">{count.toLocaleString()} blocks · drag to turn, scroll to zoom</span>
        </div>
      </div>
      <div class="s3-time">
        <button class="tool" onClick={() => setPlay(!play)} aria-pressed={play}>
          {play ? "❚❚ Pause" : "▶ Play the day"}
        </button>
        <input type="range" min={0} max={23} value={hour} aria-label="Hour (UTC)" onInput={(e) => (setPlay(false), setHour(Number((e.target as HTMLInputElement).value)))} />
        <span class="mono s3-hour">{String(hour).padStart(2, "0")}00 UTC</span>
      </div>
    </div>
  );
}
