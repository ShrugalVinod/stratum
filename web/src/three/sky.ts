// The 3D sky over India (/3d): one real day, minute by minute. A physically based sky with the
// sun where it really was over India at that minute (day, dusk, night with stars and city
// lights), the humid air where contrails last as soft cloud sheets at their flight levels
// (hour by hour, blended), every airliner of the day flying its real track, and the lasting
// contrails CoCiP found: drawn as the aircraft passes, spreading and fading over their modelled
// lifetime. Heights are exaggerated so the layers can be seen. three.js, loaded only here.

import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const EXAG = 40; // vertical exaggeration
const LON0 = 80;
const LAT0 = 22;
const KM_PER_UNIT = 111.2;
const GROUND = { w: 50, e: 112, s: -6, n: 46 };
export const DEFAULT_FL = 350; // a flight with no level in our data is drawn here
const HOME = { pos: new T.Vector3(-3, 15, 27), target: new T.Vector3(0, 2.2, 0) };

/** Scene coordinates: x east, y up, z south; one unit ≈ one degree. */
export const xOf = (lon: number) => lon - LON0;
export const zOf = (lat: number) => -(lat - LAT0);
export const yOf = (fl: number) => ((fl * 30.48) / 1000) * (EXAG / KM_PER_UNIT);

type Sprite = { data: Uint8Array; width: number; height: number };
type Grid = { lat_north: number; lon_west: number; step_deg: number; rows: number; cols: number };
export type SkyFlight = { id: string; cs: string; type: string | null; mins: number[]; xy: [number, number][]; fl: number; makesContrail: boolean };
export type SkyContrail = { flight: string; a: [number, number]; b: [number, number]; fl: number; t0: number; t1: number; lifeMin: number };
export type SkyPick = { id: string; cs: string; type: string | null; fl: number; inContrail: boolean; x: number; y: number };

export type SkyHandle = {
  setHumid(levels: { fl: number; sprite: Sprite }[], grid: Grid, toRel: (v: number) => number): void;
  setDay(date: string, flights: SkyFlight[], contrails: SkyContrail[]): void;
  /** minutes after 00:00 UTC; the scene reads it every frame */
  time: { min: number };
  follow(id: string | null): void;
  home(): void;
  stats(): { airborne: number; contrails: number; sunElev: number };
  onPick(fn: (p: SkyPick | null, click: boolean) => void): void;
  /** the followed flight left the scene (landed or flew out of the area) */
  onFollowEnd(fn: () => void): void;
  dispose(): void;
};

/** The sun over India at a UTC day and minute (NOAA's approximation): elevation and azimuth, degrees. */
export function sunAt(date: string, min: number, lat = LAT0, lon = LON0): { elev: number; az: number } {
  const d0 = Date.parse(`${date}T00:00:00Z`);
  const n = Math.floor((d0 - Date.UTC(new Date(d0).getUTCFullYear(), 0, 0)) / 86_400_000);
  const rad = Math.PI / 180;
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + n)) / 365) * rad;
  const B = (2 * Math.PI * (n - 81)) / 364;
  const eqt = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const H = ((min + 4 * lon + eqt) / 4 - 180) * rad;
  const phi = lat * rad;
  const elev = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / rad + 180;
  return { elev: elev / rad, az: az % 360 };
}

export function createSky(el: HTMLElement, geo: { countries: GeoJSON.FeatureCollection; states: GeoJSON.FeatureCollection; cities: GeoJSON.FeatureCollection }): SkyHandle {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = el.clientWidth < 760;
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.outputColorSpace = T.SRGBColorSpace;
  el.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.fog = new T.Fog(0x9fb8d4, 45, 140);
  const camera = new T.PerspectiveCamera(42, 1, 0.02, 12000);
  camera.position.set(0, 70, 55);
  const controls = new OrbitControls(camera, renderer.domElement);
  if (import.meta.env.DEV) Object.assign(window, { __skyCam: camera, __skyTarget: controls.target }); // local testing only
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.6;
  controls.maxDistance = 140;

  // ── sky, sun, stars ────────────────────────────────────────────────────────
  const sky = new Sky();
  sky.scale.setScalar(6000);
  const su = sky.material.uniforms;
  su.turbidity.value = 7;
  su.rayleigh.value = 1.6;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.86;
  scene.add(sky);
  const sunLight = new T.DirectionalLight(0xffffff, 2);
  scene.add(sunLight, sunLight.target);
  const hemi = new T.HemisphereLight(0xbcd4ff, 0x2a2a20, 0.6);
  scene.add(hemi);
  const starGeo = new T.BufferGeometry();
  const sp: number[] = [];
  for (let i = 0; i < 3000; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    sp.push(r * Math.cos(th) * 3000, Math.abs(u) * 3000, r * Math.sin(th) * 3000);
  }
  starGeo.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
  const stars = new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  // ── the ground: land, sea, borders, and city lights that come on at night ─
  const [map, lights] = groundTextures(geo);
  const groundMat = new T.MeshStandardMaterial({ map, emissiveMap: lights, emissive: new T.Color(0xffc27a), emissiveIntensity: 0, roughness: 0.92, metalness: 0 });
  const ground = new T.Mesh(new T.PlaneGeometry(GROUND.e - GROUND.w, GROUND.n - GROUND.s), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(xOf((GROUND.w + GROUND.e) / 2), 0, zOf((GROUND.s + GROUND.n) / 2));
  scene.add(ground);

  // ── humid air: soft particles, blended from one hour to the next ──────────
  const humidMat = new T.ShaderMaterial({
    uniforms: { uMix: { value: 0 }, uTime: { value: 0 }, uPx: { value: 600 }, uColor: { value: new T.Color(0xf2f7ff) }, uOpacity: { value: 0.32 } },
    vertexShader: /* glsl */ `
      attribute float aV0; attribute float aV1; attribute float aSeed;
      uniform float uMix; uniform float uTime; uniform float uPx;
      varying float vA; varying float vNear;
      void main() {
        float v = mix(aV0, aV1, uMix);
        vec3 p = position;
        p.x += sin(uTime * 0.21 + aSeed * 40.0) * 0.035;
        p.z += cos(uTime * 0.17 + aSeed * 23.0) * 0.035;
        p.y += sin(uTime * 0.31 + aSeed * 11.0) * 0.012;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = v > 0.02 ? min((0.32 + 0.55 * aSeed) * uPx / -mv.z, 260.0) : 0.0;
        vA = v;
        vNear = smoothstep(0.25, 1.2, -mv.z); // see through the haze right around the camera
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vA; varying float vNear;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 14.0) * vA * uOpacity * vNear;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  let humid: { points: T.Points; vals: Float32Array; n: number; hour: number } | null = null;

  // ── airliners ─────────────────────────────────────────────────────────────
  const planeGeo = planeGeometry();
  const planeMat = new T.MeshStandardMaterial({ color: 0xf2f4f7, emissive: 0xc8d2e0, emissiveIntensity: 0.22, roughness: 0.38, metalness: 0.3, side: T.DoubleSide });
  let planes = new T.InstancedMesh(planeGeo, planeMat, 1);
  scene.add(planes);
  // strobe lights on every airliner (they make the planes findable at night and from far away)
  const strobeGeo = new T.BufferGeometry();
  const strobeMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 600 }, uNight: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; attribute float aHot;
      uniform float uTime; uniform float uPx; uniform float uNight;
      varying float vB; varying float vHot;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float blink = step(0.86, fract(uTime * 0.9 + aSeed));
        vB = mix(0.35, 1.0, blink) * mix(0.55, 1.0, uNight);
        vHot = aHot;
        gl_PointSize = clamp((0.16 + 0.1 * blink) * uPx / -mv.z, 2.0, 18.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vB; varying float vHot;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 18.0) * vB;
        vec3 col = mix(vec3(1.0, 0.97, 0.92), vec3(1.0, 0.55, 0.2), vHot);
        gl_FragColor = vec4(col * 1.6, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const strobes = new T.Points(strobeGeo, strobeMat);
  scene.add(strobes);
  // navigation lights on the plane being ridden: red left wingtip, green right, white tail
  const navGeo = new T.BufferGeometry();
  navGeo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(9), 3));
  navGeo.setAttribute("color", new T.Float32BufferAttribute([1, 0.15, 0.1, 0.1, 1, 0.3, 1, 1, 1], 3));
  const nav = new T.Points(
    navGeo,
    new T.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, map: glowTexture() }),
  );
  nav.visible = false;
  scene.add(nav);
  let flights: SkyFlight[] = [];
  let day = "2026-02-01";

  // ── lasting contrails: ribbons drawn as the aircraft passes, then spreading and fading ─
  const contrailUniforms = { uTime: { value: 0 }, uTint: { value: new T.Color(0xffffff) } };
  const ribbonMat = (vertical: boolean) =>
    new T.ShaderMaterial({
      uniforms: contrailUniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aA; attribute vec3 aB; attribute vec3 aT; attribute float aSeed;
        uniform float uTime;
        varying float vAlpha; varying vec2 vUv; varying float vSeed;
        void main() {
          float t0 = aT.x; float t1 = aT.y; float life = aT.z;
          float along = position.x + 0.5;
          float passed = t0 + along * max(1.0, t1 - t0);
          float age = uTime - passed;
          vec3 dir = aB - aA;
          vec3 p = aA + dir * along;
          float k = clamp(age / life, 0.0, 1.0);
          ${vertical ? "vec3 side = vec3(0.0, 1.0, 0.0); float w = mix(0.012, 0.09, sqrt(k));" : "vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), dir)); float w = mix(0.02, 0.5, sqrt(k)) * (0.75 + 0.5 * aSeed);"}
          p += side * position.y * w;
          p.y -= k * 0.06;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          float shown = step(0.0, age) * step(age, life);
          vAlpha = shown * (1.0 - smoothstep(0.55, 1.0, k)) * mix(0.95, 0.4, k);
          vUv = vec2(along, position.y + 0.5);
          vSeed = aSeed;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying float vAlpha; varying vec2 vUv; varying float vSeed;
        void main() {
          float across = exp(-pow((vUv.y - 0.5) * 2.2, 2.0) * 2.6);
          float wisp = 0.72 + 0.28 * sin(vUv.x * 61.0 + vSeed * 50.0) * sin(vUv.x * 17.0 + vSeed * 9.0);
          float a = vAlpha * across * wisp;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uTint, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    });
  const ribbonFlat = ribbonMat(false);
  const ribbonUp = ribbonMat(true);
  let ribbons: T.Mesh[] = [];
  let contrails: SkyContrail[] = [];

  // ── post-processing: a soft glow on lights, the sun and the strobes ───────
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (!small && !still) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.5, 0.55, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ── size, picking, camera moves ───────────────────────────────────────────
  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const px = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    humidMat.uniforms.uPx.value = px;
    strobeMat.uniforms.uPx.value = px;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  const ray = new T.Raycaster();
  const mouse = new T.Vector2();
  let pickFn: (p: SkyPick | null, click: boolean) => void = () => {};
  let airborne: { f: SkyFlight; p: T.Vector3; dir: T.Vector3; hot: boolean }[] = [];
  const pick = (e: PointerEvent, click: boolean) => {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    // nearest airborne plane to the ray, within a few pixels' worth of distance
    let best: (typeof airborne)[number] | null = null;
    let bestD = Infinity;
    for (const a of airborne) {
      const d = ray.ray.distanceSqToPoint(a.p);
      const dist = camera.position.distanceTo(a.p);
      const tol = (0.012 * dist) ** 2 + 0.002;
      if (d < tol && d < bestD) {
        best = a;
        bestD = d;
      }
    }
    pickFn(best ? { id: best.f.id, cs: best.f.cs, type: best.f.type, fl: best.f.fl, inContrail: best.hot, x: e.clientX - r.left, y: e.clientY - r.top } : null, click);
  };
  let downAt = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => pick(e, false);
  const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) pick(e, true);
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  let following: string | null = null;
  let lostAt = 0; // when the followed flight was last missing (it may not be flying yet this frame)
  let endFn: () => void = () => {};
  const camDir = new T.Vector3(0, 0, -1); // smoothed heading: the tracks turn at their points
  let flight: { from: T.Vector3; to: T.Vector3; tFrom: T.Vector3; tTo: T.Vector3; t0: number; ms: number } | null = null;
  const fly = (pos: T.Vector3, target: T.Vector3, ms: number) => {
    flight = { from: camera.position.clone(), to: pos.clone(), tFrom: controls.target.clone(), tTo: target.clone(), t0: performance.now(), ms: still ? 1 : ms };
  };
  fly(HOME.pos, HOME.target, 4200); // the opening: from high above down to India

  // ── the frame ─────────────────────────────────────────────────────────────
  const time = { min: 720 };
  const m4 = new T.Matrix4();
  const q = new T.Quaternion();
  const s3 = new T.Vector3(1, 1, 1);
  const fwd = new T.Vector3(0, 0, -1);
  let sunElev = 0;
  let raf = 0;
  const t0 = performance.now();
  let lastFrame = t0;

  const frame = (now: number) => {
    const secs = (now - t0) / 1000;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const min = time.min;
    // sun, sky, light, stars, city lights, fog
    const sun = sunAt(day, min);
    sunElev = sun.elev;
    const e = (sun.elev * Math.PI) / 180;
    const a = (sun.az * Math.PI) / 180;
    const dir = new T.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
    su.sunPosition.value.copy(dir);
    const dayK = T.MathUtils.smoothstep(sun.elev, -6, 8); // 0 night … 1 day
    const dusk = Math.max(0, 1 - Math.abs(sun.elev - 2) / 10);
    sunLight.position.copy(dir).multiplyScalar(80);
    sunLight.intensity = 2.4 * dayK;
    sunLight.color.setRGB(1, 0.86 + 0.14 * (1 - dusk), 0.72 + 0.28 * (1 - dusk));
    // moonlight keeps the land faintly visible at night; the day sky lights it from above
    hemi.intensity = 0.85 + 0.15 * dayK;
    hemi.color.setRGB(0.45 + 0.29 * dayK, 0.55 + 0.28 * dayK, 0.85 + 0.15 * dayK);
    hemi.groundColor.setRGB(0.1 + 0.07 * dayK, 0.1 + 0.07 * dayK, 0.14 + 0.0 * dayK);
    (stars.material as T.PointsMaterial).opacity = (1 - dayK) * 0.9;
    groundMat.emissiveIntensity = (1 - dayK) ** 2 * 1.5;
    renderer.toneMappingExposure = 0.46 + 0.14 * dayK;
    const fogCol = new T.Color(0x060b16).lerp(new T.Color(0xd59a6a), dusk * (1 - dayK * 0.5)).lerp(new T.Color(0x9fb8d4), dayK * (1 - dusk * 0.6));
    (scene.fog as T.Fog).color.copy(fogCol);
    humidMat.uniforms.uColor.value.setRGB(0.42 + 0.58 * dayK, 0.5 + 0.47 * dayK + 0.05 * dusk, 0.72 + 0.28 * dayK - 0.1 * dusk);
    humidMat.uniforms.uOpacity.value = 0.2 + 0.16 * dayK;
    contrailUniforms.uTint.value.setRGB(0.55 + 0.45 * dayK + 0.2 * dusk, 0.6 + 0.4 * dayK, 0.75 + 0.25 * dayK - 0.15 * dusk);
    if (bloom) bloom.strength = 0.35 + 0.45 * (1 - dayK);
    // humid air: the hour and the next, blended
    humidMat.uniforms.uTime.value = secs;
    if (humid) {
      const h = Math.min(23, Math.floor(min / 60));
      if (h !== humid.hour) {
        const g = humid.points.geometry;
        const v0 = g.getAttribute("aV0") as T.BufferAttribute;
        const v1 = g.getAttribute("aV1") as T.BufferAttribute;
        for (let i = 0; i < humid.n; i++) {
          v0.array[i] = humid.vals[i * 24 + h];
          v1.array[i] = humid.vals[i * 24 + Math.min(23, h + 1)];
        }
        v0.needsUpdate = v1.needsUpdate = true;
        humid.hour = h;
      }
      humidMat.uniforms.uMix.value = h < 23 ? min / 60 - h : 0;
    }
    // airliners in the air this minute
    airborne = [];
    const hotIds = new Set(contrails.filter((c) => min >= c.t0 && min <= c.t1).map((c) => c.flight));
    for (const f of flights) {
      const ms = f.mins;
      if (min < ms[0] || min > ms[ms.length - 1]) continue;
      let k = 1;
      while (k < ms.length - 1 && ms[k] < min) k++;
      const w = ms[k] > ms[k - 1] ? (min - ms[k - 1]) / (ms[k] - ms[k - 1]) : 0;
      const [x0, z0] = [xOf(f.xy[k - 1][0]), zOf(f.xy[k - 1][1])];
      const [x1, z1] = [xOf(f.xy[k][0]), zOf(f.xy[k][1])];
      const p = new T.Vector3(x0 + (x1 - x0) * w, yOf(f.fl), z0 + (z1 - z0) * w);
      const d = new T.Vector3(x1 - x0, 0, z1 - z0);
      if (d.lengthSq() < 1e-9) d.set(0, 0, -1);
      airborne.push({ f, p, dir: d.normalize(), hot: hotIds.has(f.id) });
    }
    if (planes.count !== airborne.length && airborne.length > (planes.instanceMatrix.count ?? 0)) {
      scene.remove(planes);
      planes.dispose();
      planes = new T.InstancedMesh(planeGeo, planeMat, Math.max(64, airborne.length * 2));
      scene.add(planes);
    }
    const sp = new Float32Array(airborne.length * 3);
    const seed = new Float32Array(airborne.length);
    const hot = new Float32Array(airborne.length);
    const zoomScale = T.MathUtils.clamp(camera.position.distanceTo(controls.target) / 30, 0.25, 1.6);
    airborne.forEach((b, i) => {
      q.setFromUnitVectors(fwd, b.dir);
      s3.setScalar(b.f.id === following ? 0.9 : zoomScale);
      m4.compose(b.p, q, s3);
      planes.setMatrixAt(i, m4);
      sp.set([b.p.x, b.p.y + 0.012, b.p.z], i * 3);
      seed[i] = (b.f.id.charCodeAt(0) * 0.137 + b.f.id.charCodeAt(1) * 0.071) % 1;
      hot[i] = b.hot ? 1 : 0;
    });
    planes.count = airborne.length;
    const rode = following ? airborne.find((x) => x.f.id === following) : null;
    nav.visible = !!rode;
    if (rode) {
      const right = new T.Vector3(-rode.dir.z, 0, rode.dir.x).multiplyScalar(0.9);
      const pos = navGeo.getAttribute("position") as T.BufferAttribute;
      const blink = (secs * 1.1) % 1 < 0.12 ? 1.6 : 1;
      const at = (v: T.Vector3, k: number) => pos.setXYZ(k, v.x, v.y, v.z);
      at(rode.p.clone().addScaledVector(right, -0.13).add(new T.Vector3(0, -0.004, 0)).addScaledVector(rode.dir, -0.045), 0);
      at(rode.p.clone().addScaledVector(right, 0.13).add(new T.Vector3(0, -0.004, 0)).addScaledVector(rode.dir, -0.045), 1);
      at(rode.p.clone().addScaledVector(rode.dir, -0.11).add(new T.Vector3(0, 0.055, 0)), 2);
      pos.needsUpdate = true;
      (nav.material as T.PointsMaterial).size = 0.035 * blink;
    }
    planes.instanceMatrix.needsUpdate = true;
    strobeGeo.setAttribute("position", new T.BufferAttribute(sp, 3));
    strobeGeo.setAttribute("aSeed", new T.BufferAttribute(seed, 1));
    strobeGeo.setAttribute("aHot", new T.BufferAttribute(hot, 1));
    strobeMat.uniforms.uTime.value = secs;
    strobeMat.uniforms.uNight.value = 1 - dayK;
    contrailUniforms.uTime.value = min;
    // camera: a scripted move, a ride along, or free orbit
    if (flight) {
      const k = Math.min(1, (now - flight.t0) / flight.ms);
      const ease = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(flight.from, flight.to, ease);
      controls.target.lerpVectors(flight.tFrom, flight.tTo, ease);
      if (k >= 1) flight = null;
    } else if (following) {
      const b = airborne.find((x) => x.f.id === following);
      if (b) {
        lostAt = 0;
        camDir.lerp(b.dir, 1 - Math.exp(-dt * 1.5)).normalize();
        const side = new T.Vector3(camDir.z, 0, -camDir.x);
        const want = b.p.clone().addScaledVector(camDir, -0.62).add(new T.Vector3(0, 0.16, 0)).addScaledVector(side, 0.1);
        camera.position.lerp(want, 1 - Math.exp(-dt * 2.5));
        controls.target.lerp(b.p.clone().addScaledVector(camDir, 0.9).add(new T.Vector3(0, -0.03, 0)), 1 - Math.exp(-dt * 5));
      } else {
        // not in the air this frame: wait a moment (the clock may just have jumped), then give up
        lostAt ||= now;
        if (now - lostAt > 1500) {
          following = null;
          lostAt = 0;
          fly(HOME.pos, HOME.target, 2200);
          endFn();
        }
      }
    }
    controls.update();
    if (composer) composer.render();
    else renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    time,
    setHumid(levels, grid, toRel) {
      if (humid) {
        scene.remove(humid.points);
        humid.points.geometry.dispose();
        humid = null;
      }
      const pos: number[] = [];
      const seeds: number[] = [];
      const vals: number[] = [];
      const step = 2; // 0.5° cells
      const PER = 3; // particles per cell
      for (const { fl, sprite } of levels) {
        for (let r = 0; r + step <= grid.rows; r += step)
          for (let c = 0; c + step <= grid.cols; c += step) {
            const hours = new Array(24).fill(0);
            let peak = 0;
            for (let h = 0; h < 24; h++) {
              let s = 0;
              for (let i = 0; i < step; i++) for (let j = 0; j < step; j++) s += sprite.data[(r + i) * sprite.width + h * grid.cols + c + j];
              const v = Math.min(1, toRel(s / (step * step) / 255));
              hours[h] = v;
              peak = Math.max(peak, v);
            }
            if (peak < 0.2) continue;
            const lon = grid.lon_west + (c + step / 2 - 0.5) * grid.step_deg;
            const lat = grid.lat_north - (r + step / 2 - 0.5) * grid.step_deg;
            for (let k = 0; k < PER; k++) {
              pos.push(xOf(lon + (Math.random() - 0.5) * 0.55), yOf(fl) + (Math.random() - 0.5) * 0.11, zOf(lat + (Math.random() - 0.5) * 0.55));
              seeds.push(Math.random());
              vals.push(...hours);
            }
          }
      }
      const n = seeds.length;
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.setAttribute("aSeed", new T.Float32BufferAttribute(seeds, 1));
      g.setAttribute("aV0", new T.Float32BufferAttribute(new Float32Array(n), 1));
      g.setAttribute("aV1", new T.Float32BufferAttribute(new Float32Array(n), 1));
      const points = new T.Points(g, humidMat);
      points.frustumCulled = false;
      scene.add(points);
      humid = { points, vals: new Float32Array(vals), n, hour: -1 };
    },
    setDay(date, fl, cs) {
      day = date;
      flights = fl;
      contrails = cs;
      for (const r of ribbons) {
        scene.remove(r);
        r.geometry.dispose();
      }
      ribbons = [];
      if (!cs.length) return;
      const base = new T.PlaneGeometry(1, 1, 24, 1);
      const g = new T.InstancedBufferGeometry();
      g.index = base.index;
      g.setAttribute("position", base.getAttribute("position"));
      g.setAttribute("aA", new T.InstancedBufferAttribute(new Float32Array(cs.flatMap((c) => [xOf(c.a[0]), yOf(c.fl), zOf(c.a[1])])), 3));
      g.setAttribute("aB", new T.InstancedBufferAttribute(new Float32Array(cs.flatMap((c) => [xOf(c.b[0]), yOf(c.fl), zOf(c.b[1])])), 3));
      g.setAttribute("aT", new T.InstancedBufferAttribute(new Float32Array(cs.flatMap((c) => [c.t0, c.t1, c.lifeMin])), 3));
      g.setAttribute("aSeed", new T.InstancedBufferAttribute(new Float32Array(cs.map(() => Math.random())), 1));
      g.instanceCount = cs.length;
      for (const mat of [ribbonFlat, ribbonUp]) {
        const mesh = new T.Mesh(g, mat);
        mesh.frustumCulled = false;
        scene.add(mesh);
        ribbons.push(mesh);
      }
    },
    follow(id) {
      following = id;
      flight = null;
      lostAt = 0;
      const b = airborne.find((x) => x.f.id === id);
      if (b) camDir.copy(b.dir);
    },
    home() {
      following = null;
      fly(HOME.pos, HOME.target, 2200);
    },
    stats() {
      const min = time.min;
      return { airborne: airborne.length, contrails: contrails.filter((c) => min >= c.t0 && min - c.t1 <= c.lifeMin).length, sunElev };
    },
    onPick(fn) {
      pickFn = fn;
    },
    onFollowEnd(fn) {
      endFn = fn;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      composer?.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    },
  };
}

/** A small airliner (nose towards −z): rounded fuselage, swept wings with two engines, swept
 *  tailplane and fin. About 0.24 units long at scale 1. */
function planeGeometry(): T.BufferGeometry {
  const flat = (pts: [number, number][], thick: number) => {
    // a planform in the x–z plane (shape y = scene z), thickness downwards
    const sh = new T.Shape(pts.map(([x, z]) => new T.Vector2(x, z)));
    return new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }).rotateX(Math.PI / 2);
  };
  const side = (pts: [number, number][], thick: number) => {
    // a profile in the z–y plane (shape x = scene z), thickness across
    const sh = new T.Shape(pts.map(([z, y]) => new T.Vector2(z, y)));
    return new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(thick / 2, 0, 0);
  };
  const body = new T.CapsuleGeometry(0.014, 0.2, 6, 12).rotateX(Math.PI / 2);
  const wing = (s: number) =>
    flat(
      [
        [0.012 * s, -0.03],
        [0.13 * s, 0.035],
        [0.13 * s, 0.05],
        [0.012 * s, 0.035],
      ],
      0.004,
    ).translate(0, -0.004, 0);
  const tail = (s: number) =>
    flat(
      [
        [0.008 * s, 0.085],
        [0.05 * s, 0.11],
        [0.05 * s, 0.118],
        [0.008 * s, 0.112],
      ],
      0.003,
    ).translate(0, 0.004, 0);
  const engine = (x: number) => new T.CylinderGeometry(0.0085, 0.0075, 0.04, 10).rotateX(Math.PI / 2).translate(x, -0.014, -0.008);
  const fin = side(
    [
      [0.075, 0.008],
      [0.118, 0.008],
      [0.124, 0.06],
      [0.108, 0.06],
    ],
    0.004,
  );
  return mergeGeometries([body, wing(1), wing(-1), tail(1), tail(-1), engine(0.048), engine(-0.048), fin].map((g) => g.toNonIndexed()))!;
}

/** A soft round glow for point lights. */
function glowTexture(): T.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.3, "rgba(255,255,255,0.6)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}

/** The ground's colour map and its night-lights map, drawn from the country outlines. */
function groundTextures(geo: { countries: GeoJSON.FeatureCollection; states: GeoJSON.FeatureCollection; cities: GeoJSON.FeatureCollection }): [T.CanvasTexture, T.CanvasTexture] {
  const W = 4096;
  const H = Math.round((W * (GROUND.n - GROUND.s)) / (GROUND.e - GROUND.w));
  const px = (lon: number, lat: number): [number, number] => [((lon - GROUND.w) / (GROUND.e - GROUND.w)) * W, ((GROUND.n - lat) / (GROUND.n - GROUND.s)) * H];
  const path = (g: CanvasRenderingContext2D, f: GeoJSON.Feature) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    for (const poly of polys)
      for (const ring of poly as number[][][]) {
        ring.forEach(([lo, la], i) => (i ? g.lineTo(...px(lo, la)) : g.moveTo(...px(lo, la))));
        g.closePath();
      }
  };
  // colour
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const sea = g.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#123a5c");
  sea.addColorStop(1, "#0a2440");
  g.fillStyle = sea;
  g.fillRect(0, 0, W, H);
  for (const f of geo.countries.features) {
    const india = f.properties?.iso === "IND";
    g.beginPath();
    path(g, f);
    g.fillStyle = india ? "#5b6b45" : "#4d5a3d";
    g.fill("evenodd");
  }
  // texture: a soft mottling of the land (seeded, the same every time)
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save();
  g.beginPath();
  for (const f of geo.countries.features) path(g, f);
  g.clip("evenodd");
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 6 + rnd() * 40;
    g.fillStyle = rnd() < 0.5 ? "rgba(120,110,70,0.06)" : "rgba(40,70,40,0.07)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.lineWidth = 1.2;
  g.strokeStyle = "rgba(230,236,220,0.18)";
  for (const f of geo.states.features) {
    g.beginPath();
    path(g, f);
    g.stroke();
  }
  g.lineWidth = 2.4;
  g.strokeStyle = "rgba(235,240,225,0.45)";
  for (const f of geo.countries.features) {
    g.beginPath();
    path(g, f);
    g.stroke();
  }
  // night lights: the cities (by population) and a scatter of towns over India
  const l = document.createElement("canvas");
  l.width = W;
  l.height = H;
  const n = l.getContext("2d")!;
  n.fillStyle = "#000";
  n.fillRect(0, 0, W, H);
  n.save();
  n.beginPath();
  for (const f of geo.countries.features.filter((x) => ["IND", "BGD", "PAK", "LKA", "NPL"].includes(x.properties?.iso))) path(n, f);
  n.clip("evenodd");
  for (let i = 0; i < 14000; i++) {
    const [x, y] = [rnd() * W, rnd() * H];
    n.fillStyle = `rgba(255,${190 + rnd() * 40},${110 + rnd() * 50},${0.12 + rnd() * 0.25})`;
    n.fillRect(x, y, 1.6 + rnd() * 2, 1.6 + rnd() * 2);
  }
  n.restore();
  for (const f of geo.cities.features) {
    const [lo, la] = (f.geometry as GeoJSON.Point).coordinates;
    const [x, y] = px(lo, la);
    const r = 10 + Math.sqrt(Number(f.properties?.pop ?? 1e6)) / 55;
    const grd = n.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,235,190,1)");
    grd.addColorStop(0.25, "rgba(255,200,120,0.7)");
    grd.addColorStop(1, "rgba(255,160,60,0)");
    n.fillStyle = grd;
    n.beginPath();
    n.arc(x, y, r, 0, Math.PI * 2);
    n.fill();
  }
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  const lights = new T.CanvasTexture(l);
  lights.colorSpace = T.SRGBColorSpace;
  return [map, lights];
}
