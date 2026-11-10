// The orbital stage for the Home film: the Earth as an instrument would draw it (dark, hairline
// coasts and borders, city lights at night, the real sun for the minute shown), with one real
// day of airliners as glowing trails, the lasting contrails the physics found, and Meteosat-9
// where it really sits. Nothing here moves by itself: every frame is a pure function of the
// state it is given, so the page's scroll position can scrub it like a film.
// three.js, loaded only when this stage is used.

import * as T from "three";

export type OrbitFlight = { lon: Float32Array; lat: Float32Array; m: Float32Array };
/** A lasting-contrail stretch: flight index, start and end minute, modelled life (min), rank. */
export type OrbitStretch = { f: number; a: number; b: number; life: number; top: boolean };
/** Real imagery of the Earth, already loaded: the whole world coarse, the region around India fine. */
export type OrbitImages = { dayWorld: TexImageSource; nightWorld: TexImageSource; day: TexImageSource; night: TexImageSource };
export type OrbitInput = {
  images: OrbitImages; // day: Natural Earth II relief; night: NASA Black Marble 2016 (the real city lights)
  region: { iso: string; rings: [number, number][][] }[]; // the countries around India, as the map draws them (line work only)
  states: [number, number][][]; // India's state lines
  flights: OrbitFlight[];
  stretches: OrbitStretch[];
  date: string;
  small: boolean;
};
export type OrbitState = {
  lon: number; // camera target
  lat: number;
  dist: number; // distance from the target, Earth radii
  pitch: number; // 0 = straight down, 90 = along the horizon (degrees)
  bearing: number; // compass direction the camera looks towards (degrees)
  ox: number; // where the target sits on screen, px right / down of the centre
  oy: number;
  clock: number; // minutes UTC of the film day (trails, aircraft)
  sun: [number, number, number]; // unit vector to the sub-solar point (see sunDir)
  trails: number; // 0–1
  memory: number; // minutes a trail stays bright
  residual: number; // 0–1: what stays of an old trail
  heads: number; // 0–1 aircraft
  flagged: number; // 0–1 lasting-contrail stretches
  all: number; // 0–1 every stretch of the day at once
  top: number; // 0–1 the few that carry most of the warming
  sat: number; // 0–1 Meteosat-9 and its line of sight
  aim: [number, number]; // where the satellite is looking (lon, lat)
  dim: number; // 0–1 darken the world
  dawn: number; // 0–1 the last scene's two flights: one in the humid layer, one 2,000 ft above
  dawnT: number; // 0–1 how far along they are
  time: number; // seconds (twinkle only)
};
export type OrbitHandle = {
  render(s: OrbitState): void;
  /** screen position (px) of a point on the globe with the last rendered camera */
  project(lon: number, lat: number, alt?: number): { x: number; y: number; front: boolean };
  projectSat(): { x: number; y: number; front: boolean };
  /** the two dawn aircraft (0: as planned, 1: 2,000 ft higher) */
  projectDawn(i: 0 | 1): { x: number; y: number; front: boolean };
  resize(): void;
  dispose(): void;
};

const RAD = Math.PI / 180;
const LON0 = 78; // the meridian facing +z
const REG = { w: 50, e: 114, s: -4, n: 48 }; // the line work's box (the map's data covers 55–112°E, 2°S–46°N)
export const IMG = { w: 30, e: 130, s: -15, n: 55 }; // the box of the fine day and night images
const GEO_R = 6.61; // geostationary orbit, Earth radii from the centre
const SAT_LON = 45.5; // Meteosat-9 (IODC)
const BASE = 0.0016; // cruise altitude above the surface, drawn about five times too high so trails clear the ground

const dirOf = (lon: number, lat: number, out = new T.Vector3()) => {
  const p = lat * RAD;
  const l = (lon - LON0) * RAD;
  return out.set(Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l));
};

/** Unit vector to the sub-solar point at a UTC date and minute (NOAA's approximation). */
export function sunDir(date: string, min: number): [number, number, number] {
  const d0 = Date.parse(`${date}T00:00:00Z`);
  const n = Math.floor((d0 - Date.UTC(new Date(d0).getUTCFullYear(), 0, 0)) / 86_400_000);
  const decl = -23.44 * Math.cos((2 * Math.PI * (n + 10)) / 365);
  const B = (2 * Math.PI * (n - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const v = dirOf(-(min - 720 + eot) / 4, decl);
  return [v.x, v.y, v.z];
}

const RIBBON = /* glsl */ `
  attribute vec4 aP;
  attribute vec4 aQ;
  attribute vec2 aS;
  uniform vec2 uRes;
  uniform float uExag;
  vec3 place(vec4 p) { return p.xyz * (1.0 + ${BASE.toFixed(4)} * uExag + p.w); }
  /* a segment drawn as a screen-facing strip: width in pixels, whatever the zoom */
  vec4 ribbon(float halfPx) {
    vec4 cp = projectionMatrix * viewMatrix * vec4(place(aP), 1.0);
    vec4 cq = projectionMatrix * viewMatrix * vec4(place(aQ), 1.0);
    if (cp.w <= 0.0 || cq.w <= 0.0) return vec4(2.0, 2.0, 2.0, 1.0);
    vec2 d = (cq.xy / cq.w - cp.xy / cp.w) * uRes * aS.y;
    float len = length(d);
    vec2 n = len > 1e-5 ? vec2(-d.y, d.x) / len : vec2(0.0, 1.0);
    cp.xy += n * aS.x * halfPx / uRes * cp.w;
    return cp;
  }
`;

export function createOrbit(canvas: HTMLCanvasElement, input: OrbitInput): OrbitHandle {
  const small = input.small;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  const dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x03050a, 1);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, 0.01, 200);
  const res = new T.Vector2(1, 1);
  const sun = new T.Vector3(1, 0, 0);

  // ── the Earth ──────────────────────────────────────────────────────────────
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const photo = (img: TexImageSource, fine: boolean) => {
    const t = new T.Texture(img as HTMLImageElement);
    t.wrapS = fine ? T.ClampToEdgeWrapping : T.RepeatWrapping;
    t.anisotropy = fine ? aniso : 1;
    t.generateMipmaps = fine;
    t.minFilter = fine ? T.LinearMipmapLinearFilter : T.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const tex = {
    dayW: photo(input.images.dayWorld, false),
    nightW: photo(input.images.nightWorld, false),
    day: photo(input.images.day, true),
    night: photo(input.images.night, true),
    lines: lineWork(input, aniso),
  };
  const earthMat = new T.ShaderMaterial({
    uniforms: {
      uDayW: { value: tex.dayW },
      uNightW: { value: tex.nightW },
      uDay: { value: tex.day },
      uNight: { value: tex.night },
      uLines: { value: tex.lines },
      uSun: { value: sun },
      uDim: { value: 0 },
      uBox: { value: new T.Vector4(REG.w, REG.s, REG.e, REG.n) },
      uImg: { value: new T.Vector4(IMG.w, IMG.s, IMG.e, IMG.n) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vN = normalize(position);
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDayW;
      uniform sampler2D uNightW;
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform sampler2D uLines;
      uniform vec3 uSun;
      uniform float uDim;
      uniform vec4 uBox;
      uniform vec4 uImg;
      varying vec3 vN;
      varying vec3 vW;
      float gridLine(float v, float stepDeg) {
        float g = abs(fract(v / stepDeg - 0.5) - 0.5) / max(fwidth(v / stepDeg), 1e-6);
        return 1.0 - min(g, 1.0);
      }
      float edge(vec2 uv, float w) {
        return smoothstep(0.0, w, uv.x) * smoothstep(1.0, 1.0 - w, uv.x) * smoothstep(0.0, w, uv.y) * smoothstep(1.0, 1.0 - w, uv.y);
      }
      void main() {
        vec3 n = normalize(vN);
        float lon = degrees(atan(n.x, n.z)) + ${LON0.toFixed(1)};
        float lat = degrees(asin(clamp(n.y, -1.0, 1.0)));
        vec2 uvW = vec2(fract((lon + 180.0) / 360.0), (lat + 90.0) / 180.0);
        vec2 uvI = vec2((lon - uImg.x) / (uImg.z - uImg.x), (lat - uImg.y) / (uImg.w - uImg.y));
        float fine = edge(uvI, 0.05);
        vec3 dayTex = mix(texture2D(uDayW, uvW).rgb, texture2D(uDay, clamp(uvI, 0.0, 1.0)).rgb, fine);
        vec3 nightTex = mix(texture2D(uNightW, uvW).rgb, texture2D(uNight, clamp(uvI, 0.0, 1.0)).rgb, fine);
        vec2 uvL = vec2((lon - uBox.x) / (uBox.z - uBox.x), (lat - uBox.y) / (uBox.w - uBox.y));
        float line = texture2D(uLines, clamp(uvL, 0.0, 1.0)).b * edge(uvL, 0.07);

        float mu = dot(n, uSun);
        float day = smoothstep(-0.12, 0.28, mu);
        // water is where the relief map is blue: deepen it, and let only it catch the sun
        float water = smoothstep(0.02, 0.14, dayTex.b - max(dayTex.r, dayTex.g) * 0.94);
        // the day side, as it looks from orbit: deep water, muted land, never white
        vec3 land = pow(dayTex, vec3(2.1)) * vec3(0.8, 0.82, 0.78);
        land = mix(vec3(dot(land, vec3(0.3, 0.6, 0.1))), land, 0.82);
        vec3 sea = mix(vec3(0.012, 0.055, 0.14), vec3(0.03, 0.13, 0.27), pow(dayTex.b, 2.0));
        vec3 lit = mix(land, sea, water) * (0.42 + 0.78 * max(mu, 0.0));
        // the night side: the real lights, over land you can just make out
        float glow = max(nightTex.r, max(nightTex.g, nightTex.b));
        vec3 lights = vec3(1.0, 0.8, 0.52) * (1.0 - exp(-pow(max(glow - 0.07, 0.0), 1.35) * 4.2)) * 1.15;
        lights += vec3(1.0, 0.95, 0.85) * smoothstep(0.75, 1.0, glow) * 0.35; // the cores of the big cities run hot
        vec3 dark = nightTex * vec3(0.5, 0.62, 0.95) * 0.5 + mix(land, sea, water) * vec3(0.02, 0.03, 0.055);
        vec3 col = mix(dark + lights, lit, day);
        // dusk and dawn: a warm band along the terminator
        float tw = smoothstep(-0.22, 0.02, mu) * (1.0 - smoothstep(0.02, 0.34, mu));
        col += vec3(0.95, 0.42, 0.18) * tw * 0.07;
        // an instrument's hairlines over the photograph: India's outline and states, a graticule
        col += vec3(0.75, 0.83, 0.98) * line * mix(0.3, 0.2, day);
        col += vec3(0.45, 0.6, 0.9) * (gridLine(lon, 10.0) + gridLine(lat, 10.0)) * 0.03 * smoothstep(84.0, 72.0, abs(lat));
        // the sun on the sea
        vec3 v = normalize(cameraPosition - vW);
        float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 180.0);
        col += vec3(1.0, 0.88, 0.72) * spec * water * 0.4 * day;
        // air: the limb brightens
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.2);
        col += mix(vec3(0.07, 0.16, 0.4), vec3(0.3, 0.55, 1.0), day) * fres * (0.4 + 0.6 * day);
        col *= 1.0 - uDim * 0.72;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const earth = new T.Mesh(new T.SphereGeometry(1, small ? 96 : 160, small ? 64 : 110), earthMat);
  scene.add(earth);

  // ── the air seen edge-on: a glow that follows the sun around the limb ─────
  const airMat = new T.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uDim: { value: 0 } },
    side: T.BackSide,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform float uDim;
      varying vec3 vW;
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = normalize(vW - ro);
        float tca = -dot(ro, rd);
        vec3 pc = ro + rd * max(tca, 0.0);
        float h = length(pc) - 1.0 + max(-tca, 0.0) * 0.25;
        if (h < -0.002) discard;
        float a = exp(-max(h, 0.0) / 0.017) * 0.9 + exp(-max(h, 0.0) / 0.055) * 0.22;
        float mu = dot(normalize(pc), uSun);
        float lit = smoothstep(-0.3, 0.22, mu);
        vec3 col = mix(vec3(0.05, 0.12, 0.34), vec3(0.28, 0.54, 1.0), lit);
        float tw = exp(-pow((mu + 0.02) / 0.13, 2.0));
        col = mix(col, vec3(1.0, 0.46, 0.2), tw * 0.62);
        float alpha = a * (0.2 + 0.95 * lit + tw * 0.5) * (1.0 - uDim * 0.6);
        gl_FragColor = vec4(col * alpha, 1.0);
      }`,
  });
  scene.add(new T.Mesh(new T.SphereGeometry(1.2, 96, 64), airMat));

  // ── stars ──────────────────────────────────────────────────────────────────
  const starN = small ? 1400 : 2600;
  const sPos = new Float32Array(starN * 3);
  const sSeed = new Float32Array(starN * 2);
  let seed = 20260101;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < starN; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    sPos.set([r * Math.cos(th) * 90, u * 90, r * Math.sin(th) * 90], i * 3);
    sSeed.set([rnd(), rnd()], i * 2);
  }
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute("position", new T.BufferAttribute(sPos, 3));
  starGeo.setAttribute("aSeed", new T.BufferAttribute(sSeed, 2));
  const starMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: dpr }, uDim: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime;
      uniform float uPx;
      varying float vA;
      void main() {
        float big = pow(aSeed.x, 6.0);
        vA = (0.35 + 0.65 * aSeed.y) * (0.82 + 0.18 * sin(uTime * (0.6 + aSeed.x * 2.0) + aSeed.y * 40.0));
        gl_PointSize = (1.1 + big * 2.4) * uPx;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uDim;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.1, d) * vA * (1.0 - uDim * 0.5);
        gl_FragColor = vec4(vec3(0.86, 0.91, 1.0) * a, 1.0);
      }`,
  });
  const stars = new T.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // ── every flight of the day, as strips with a time at each vertex ─────────
  const segs: number[][] = []; // [lon0, lat0, t0, lon1, lat1, t1]
  for (const f of input.flights) {
    for (let i = 1; i < f.m.length; i++) {
      const dl = Math.hypot(f.lon[i] - f.lon[i - 1], f.lat[i] - f.lat[i - 1]);
      if (dl > 25) continue; // a jump in the data, not a flight path
      const k = Math.max(1, Math.ceil(dl / 1.5));
      for (let j = 0; j < k; j++) {
        const a = j / k, b = (j + 1) / k;
        segs.push([
          f.lon[i - 1] + (f.lon[i] - f.lon[i - 1]) * a, f.lat[i - 1] + (f.lat[i] - f.lat[i - 1]) * a, f.m[i - 1] + (f.m[i] - f.m[i - 1]) * a,
          f.lon[i - 1] + (f.lon[i] - f.lon[i - 1]) * b, f.lat[i - 1] + (f.lat[i] - f.lat[i - 1]) * b, f.m[i - 1] + (f.m[i] - f.m[i - 1]) * b,
        ]);
      }
    }
  }
  const trailGeo = stripGeometry(segs.length, (i, put) => {
    const s = segs[i];
    put(s[0], s[1], 0, s[2], s[3], s[4], 0, s[5], 0, 0);
  });
  const trailShader = (halfPx: number, gain: number) =>
    new T.ShaderMaterial({
      uniforms: {
        uRes: { value: res },
        uExag: { value: 1 },
        uClock: { value: 0 },
        uMemory: { value: 60 },
        uResidual: { value: 0.1 },
        uOpacity: { value: 1 },
        uHalf: { value: halfPx * dpr },
        uGain: { value: gain },
        uSun: { value: sun },
      },
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${RIBBON}
        attribute vec3 aT;
        uniform float uHalf;
        uniform vec3 uSun;
        varying float vSide;
        varying float vT;
        varying float vDay;
        void main() {
          gl_Position = ribbon(uHalf);
          vSide = aS.x;
          vT = aT.x;
          vDay = smoothstep(-0.1, 0.3, dot(aP.xyz, uSun));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uClock;
        uniform float uMemory;
        uniform float uResidual;
        uniform float uOpacity;
        uniform float uGain;
        varying float vSide;
        varying float vT;
        varying float vDay;
        void main() {
          float age = uClock - vT;
          if (age < 0.0) discard;
          float fresh = exp(-age / uMemory);
          float a = mix(uResidual, 1.0, fresh);
          float edge = 1.0 - smoothstep(0.2, 1.0, abs(vSide));
          vec3 col = mix(vec3(0.5, 0.68, 1.0), vec3(1.0, 0.97, 0.9), exp(-age / (uMemory * 0.35)));
          gl_FragColor = vec4(col * a * edge * uOpacity * uGain * mix(1.0, 0.8, vDay), 1.0);
        }`,
    });
  const trailGlow = trailShader(small ? 2.6 : 3.4, 0.13);
  const trailCore = trailShader(0.75, 0.8);
  for (const m of [trailGlow, trailCore]) {
    const mesh = new T.Mesh(trailGeo, m);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ── lasting contrails: wider, warmer, spreading with age ──────────────────
  const pos = (f: OrbitFlight, t: number): [number, number] | null => {
    const m = f.m;
    if (t < m[0] || t > m[m.length - 1]) return null;
    for (let i = 1; i < m.length; i++)
      if (t <= m[i]) {
        const k = (t - m[i - 1]) / Math.max(1e-6, m[i] - m[i - 1]);
        return [f.lon[i - 1] + (f.lon[i] - f.lon[i - 1]) * k, f.lat[i - 1] + (f.lat[i] - f.lat[i - 1]) * k];
      }
    return [f.lon[m.length - 1], f.lat[m.length - 1]];
  };
  const cSegs: { s: number[]; life: number; top: number }[] = [];
  for (const st of input.stretches) {
    const f = input.flights[st.f];
    if (!f) continue;
    const steps = Math.max(1, Math.min(40, Math.ceil((st.b - st.a) / 2)));
    let prev = pos(f, st.a);
    for (let q = 1; q <= steps; q++) {
      const t1 = st.a + ((st.b - st.a) * q) / steps;
      const cur = pos(f, t1);
      if (prev && cur) cSegs.push({ s: [prev[0], prev[1], st.a + ((st.b - st.a) * (q - 1)) / steps, cur[0], cur[1], t1], life: st.life, top: st.top ? 1 : 0 });
      prev = cur;
    }
  }
  const conGeo = stripGeometry(cSegs.length, (i, put) => {
    const c = cSegs[i];
    put(c.s[0], c.s[1], 0, c.s[2], c.s[3], c.s[4], 0, c.s[5], c.life, c.top);
  });
  const conShader = (halfPx: number, gain: number) =>
    new T.ShaderMaterial({
      uniforms: {
        uRes: { value: res },
        uExag: { value: 1 },
        uClock: { value: 0 },
        uAll: { value: 0 },
        uTop: { value: 0 },
        uOpacity: { value: 0 },
        uHalf: { value: halfPx * dpr },
        uGain: { value: gain },
      },
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${RIBBON}
        attribute vec3 aT;
        uniform float uHalf;
        uniform float uClock;
        uniform float uAll;
        uniform float uTop;
        varying float vSide;
        varying float vVis;
        varying float vTop;
        void main() {
          float age = uClock - aT.x;
          float grown = mix(smoothstep(0.0, 150.0, age), 1.0, uAll);
          float emph = mix(1.0, mix(0.7, 1.45, aT.z), uTop);
          gl_Position = ribbon(uHalf * (0.45 + 0.85 * grown) * emph);
          vSide = aS.x;
          vTop = aT.z;
          float alive = step(0.0, age) * (1.0 - smoothstep(aT.y * 0.75, aT.y, age));
          vVis = mix(alive, 1.0, uAll);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTop;
        uniform float uOpacity;
        uniform float uGain;
        varying float vSide;
        varying float vVis;
        varying float vTop;
        void main() {
          if (vVis <= 0.001) discard;
          float edge = 1.0 - smoothstep(0.15, 1.0, abs(vSide));
          vec3 col = mix(vec3(1.0, 0.56, 0.26), vec3(1.0, 0.25, 0.32), vTop * uTop);
          float a = mix(1.0, mix(0.3, 1.25, vTop), uTop);
          gl_FragColor = vec4(col * edge * vVis * a * uOpacity * uGain, 1.0);
        }`,
    });
  const conGlow = conShader(small ? 5 : 7, 0.22);
  const conCore = conShader(1.5, 1.0);
  for (const m of [conGlow, conCore]) {
    const mesh = new T.Mesh(conGeo, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
  }

  // ── the aircraft themselves ────────────────────────────────────────────────
  const maxHeads = input.flights.length;
  const hPos = new Float32Array(maxHeads * 3);
  const hKind = new Float32Array(maxHeads);
  const headGeo = new T.BufferGeometry();
  headGeo.setAttribute("position", new T.BufferAttribute(hPos, 3).setUsage(T.DynamicDrawUsage));
  headGeo.setAttribute("aKind", new T.BufferAttribute(hKind, 1).setUsage(T.DynamicDrawUsage));
  const headMat = new T.ShaderMaterial({
    uniforms: { uPx: { value: dpr }, uOpacity: { value: 1 }, uScale: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aKind;
      uniform float uPx;
      uniform float uScale;
      varying float vK;
      void main() {
        vK = aKind;
        gl_PointSize = (aKind > 0.5 ? 15.0 : 9.0) * uPx * uScale;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vK;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = smoothstep(0.34, 0.12, d);
        float halo = pow(max(1.0 - d, 0.0), 2.4) * 0.5;
        vec3 col = mix(vec3(0.85, 0.93, 1.0), vec3(1.0, 0.62, 0.3), vK);
        gl_FragColor = vec4((col * halo + vec3(1.0) * core) * uOpacity, 1.0);
      }`,
  });
  const heads = new T.Points(headGeo, headMat);
  heads.frustumCulled = false;
  heads.renderOrder = 3;
  scene.add(heads);
  const making: [number, number][][] = input.flights.map(() => []);
  for (const st of input.stretches) making[st.f]?.push([st.a, st.b]);

  // ── the last scene, at dawn over the Arabian Sea: two flights on the same route. One is in the
  //    humid layer and its contrail spreads and stays, catching the first sun; the other is
  //    2,000 ft higher and its trail is gone within seconds. (An illustration: neither flew.) ──
  const DAWN = [
    { a: [70.4, 15.1], b: [74.7, 11.0], tail: 9, grow: 1, half: 2.6, color: [1.0, 0.8, 0.62] },
    { a: [69.5, 14.3], b: [73.8, 10.2], tail: 0.07, grow: 0, half: 1.4, color: [0.86, 0.92, 1.0] },
  ] as const;
  const dawnAt = (i: number, u: number): [number, number] => [DAWN[i].a[0] + (DAWN[i].b[0] - DAWN[i].a[0]) * u, DAWN[i].a[1] + (DAWN[i].b[1] - DAWN[i].a[1]) * u];
  const dawnMats = DAWN.map((d, i) => {
    const N = 64;
    const geo = stripGeometry(N, (k, put) => {
      const p0 = dawnAt(i, k / N), p1 = dawnAt(i, (k + 1) / N);
      put(p0[0], p0[1], 0.0006, k / N, p1[0], p1[1], 0.0006, (k + 1) / N, 0, 0);
    });
    const mat = new T.ShaderMaterial({
      uniforms: { uRes: { value: res }, uExag: { value: 1 }, uHead: { value: 0 }, uTail: { value: d.tail }, uGrow: { value: d.grow }, uOpacity: { value: 0 }, uHalf: { value: d.half * dpr }, uColor: { value: new T.Vector3(...d.color) } },
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${RIBBON}
        attribute vec3 aT;
        uniform float uHalf;
        uniform float uHead;
        uniform float uGrow;
        varying float vSide;
        varying float vU;
        void main() {
          float age = max(uHead - aT.x, 0.0);
          gl_Position = ribbon(uHalf * (0.7 + uGrow * 3.4 * smoothstep(0.0, 0.75, age)));
          vSide = aS.x;
          vU = aT.x;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uHead;
        uniform float uTail;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vSide;
        varying float vU;
        void main() {
          if (vU > uHead) discard;
          float age = uHead - vU;
          float keep = 1.0 - smoothstep(uTail * 0.4, uTail, age);
          float edge = pow(1.0 - abs(vSide), 1.6);
          float puff = 0.78 + 0.22 * sin(vU * 407.0 + sin(vU * 61.0) * 3.0); // a contrail is never an even line
          float fresh = 0.75 + 0.5 * exp(-age * 9.0);
          gl_FragColor = vec4(uColor * edge * keep * puff * fresh * uOpacity, 1.0);
        }`,
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    scene.add(mesh);
    return mat;
  });
  const dPos = new Float32Array(6);
  const dawnGeo = new T.BufferGeometry();
  dawnGeo.setAttribute("position", new T.BufferAttribute(dPos, 3).setUsage(T.DynamicDrawUsage));
  dawnGeo.setAttribute("aKind", new T.BufferAttribute(new Float32Array(2), 1));
  const dawnHeadMat = headMat.clone();
  const dawnHeads = new T.Points(dawnGeo, dawnHeadMat);
  dawnHeads.frustumCulled = false;
  dawnHeads.renderOrder = 5;
  scene.add(dawnHeads);
  let dawnU = 0;

  // ── Meteosat-9: a spinning drum of solar cells, far too big so it can be seen ─
  const satPos = dirOf(SAT_LON, 0).multiplyScalar(GEO_R);
  const sat = satellite();
  sat.position.copy(satPos);
  sat.scale.setScalar(0.085);
  scene.add(sat);
  const key = new T.DirectionalLight(0xffffff, 2.4);
  scene.add(key, new T.AmbientLight(0x8fb0ff, 0.55));
  const beamGeo = new T.BufferGeometry();
  beamGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(6), 3).setUsage(T.DynamicDrawUsage));
  const beamMat = new T.LineBasicMaterial({ color: 0x46dcff, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
  const beam = new T.Line(beamGeo, beamMat);
  beam.frustumCulled = false;
  scene.add(beam);

  // ── camera and frame ───────────────────────────────────────────────────────
  const n = new T.Vector3(), north = new T.Vector3(), east = new T.Vector3(), fwd = new T.Vector3(), up = new T.Vector3(), tgt = new T.Vector3(), tmp = new T.Vector3();
  let W = 1, H = 1;
  const resize = () => {
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    renderer.setSize(W, H, false);
    res.set((W * dpr) / 2, (H * dpr) / 2);
    camera.aspect = W / H;
  };
  resize();

  const render = (s: OrbitState) => {
    dirOf(s.lon, s.lat, n);
    north.set(0, 1, 0).addScaledVector(n, -n.y).normalize();
    east.crossVectors(north, n);
    const b = s.bearing * RAD, p = s.pitch * RAD;
    fwd.copy(north).multiplyScalar(Math.cos(b)).addScaledVector(east, Math.sin(b)); // the way the camera looks, along the ground
    tgt.copy(n);
    camera.position.copy(n).addScaledVector(n, Math.cos(p) * s.dist).addScaledVector(fwd, -Math.sin(p) * s.dist);
    up.copy(fwd).multiplyScalar(Math.cos(p)).addScaledVector(n, Math.sin(p));
    camera.up.copy(up);
    camera.lookAt(tgt);
    const alt = camera.position.length() - 1;
    camera.near = Math.min(s.sat > 0.002 ? 0.25 : 2, Math.max(0.0006, alt * 0.22));
    camera.far = camera.position.length() + 120;
    if (s.ox || s.oy) camera.setViewOffset(W, H, -s.ox, -s.oy, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    sun.set(s.sun[0], s.sun[1], s.sun[2]).normalize();
    key.position.copy(sun).multiplyScalar(50);
    earthMat.uniforms.uDim.value = s.dim;
    airMat.uniforms.uDim.value = s.dim;
    starMat.uniforms.uDim.value = s.dim;
    starMat.uniforms.uTime.value = s.time;

    // strips are a fixed width on screen; seen from far away they are also raised less
    const exag = 1;
    for (const m of [trailGlow, trailCore]) {
      m.uniforms.uClock.value = s.clock;
      m.uniforms.uMemory.value = s.memory;
      m.uniforms.uResidual.value = m === trailGlow ? 0 : s.residual; // an old trail is a hairline, not a glow
      m.uniforms.uExag.value = exag;
      m.uniforms.uOpacity.value = s.trails * (1 - s.dim * 0.6);
      m.visible = s.trails > 0.002;
    }
    for (const m of [conGlow, conCore]) {
      m.uniforms.uClock.value = s.clock;
      m.uniforms.uAll.value = s.all;
      m.uniforms.uTop.value = s.top;
      m.uniforms.uExag.value = exag;
      m.uniforms.uOpacity.value = s.flagged * (1 - s.dim * 0.6);
      m.visible = s.flagged > 0.002;
    }

    // aircraft in the air at this minute
    let k = 0;
    if (s.heads > 0.002) {
      const fl = input.flights;
      for (let i = 0; i < fl.length; i++) {
        const q = pos(fl[i], s.clock);
        if (!q || s.clock >= fl[i].m[fl[i].m.length - 1]) continue;
        dirOf(q[0], q[1], tmp).multiplyScalar(1 + BASE * exag);
        hPos[k * 3] = tmp.x;
        hPos[k * 3 + 1] = tmp.y;
        hPos[k * 3 + 2] = tmp.z;
        let mk = 0;
        if (s.flagged > 0.2) for (const [a, e] of making[i]) if (s.clock >= a && s.clock <= e) mk = 1;
        hKind[k++] = mk;
      }
      headGeo.attributes.position.needsUpdate = true;
      headGeo.attributes.aKind.needsUpdate = true;
    }
    headGeo.setDrawRange(0, k);
    headMat.uniforms.uOpacity.value = s.heads * (1 - s.dim * 0.6);
    // from high up the dots shrink so they do not swamp the map
    headMat.uniforms.uScale.value = Math.min(1, Math.max(0.42, 0.9 / Math.sqrt(Math.max(0.2, s.dist))));
    heads.visible = k > 0;

    dawnU = s.dawnT;
    dawnMats.forEach((m) => {
      m.uniforms.uHead.value = s.dawnT;
      m.uniforms.uOpacity.value = s.dawn;
    });
    dawnHeads.visible = s.dawn > 0.002;
    if (dawnHeads.visible) {
      for (let i = 0; i < 2; i++) {
        const q = dawnAt(i, s.dawnT);
        dirOf(q[0], q[1], tmp).multiplyScalar(1 + BASE + 0.0006);
        dPos.set([tmp.x, tmp.y, tmp.z], i * 3);
      }
      dawnGeo.attributes.position.needsUpdate = true;
      dawnHeadMat.uniforms.uOpacity.value = s.dawn;
      dawnHeadMat.uniforms.uScale.value = 1.15;
      dawnHeadMat.uniforms.uPx.value = dpr;
    }

    sat.visible = s.sat > 0.002;
    beam.visible = s.sat > 0.002;
    if (sat.visible) {
      sat.rotation.y = s.time * 0.9;
      const arr = beamGeo.attributes.position.array as Float32Array;
      dirOf(s.aim[0], s.aim[1], tmp).multiplyScalar(1.002);
      arr.set([satPos.x, satPos.y, satPos.z, tmp.x, tmp.y, tmp.z]);
      beamGeo.attributes.position.needsUpdate = true;
      beamMat.opacity = 0.75 * s.sat;
      sat.traverse((o) => {
        const mat = (o as T.Mesh).material as T.Material | undefined;
        if (mat && "opacity" in mat) {
          mat.transparent = true;
          mat.opacity = s.sat;
        }
      });
    }
    renderer.render(scene, camera);
  };

  const toScreen = (v: T.Vector3) => {
    const front = v.dot(camera.position) > 1 || v.length() > 1.5; // on our side of the globe (or well above it)
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, front: front && v.z < 1 };
  };

  return {
    render,
    project: (lon, lat, alt = 0) => toScreen(dirOf(lon, lat, new T.Vector3()).multiplyScalar(1 + alt)),
    projectSat: () => toScreen(satPos.clone()),
    projectDawn: (i) => {
      const q = dawnAt(i, dawnU);
      return toScreen(dirOf(q[0], q[1], new T.Vector3()).multiplyScalar(1 + BASE + 0.0006));
    },
    resize,
    dispose() {
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as T.Mesh;
        m.geometry?.dispose();
        const mat = m.material as T.Material | T.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      Object.values(tex).forEach((t) => t.dispose());
    },
  };
}

/** Screen-facing strips: four vertices per segment; ``put`` gives each segment's two ends
 *  (lon, lat, alt, time), and two free values (kept in aT.y and aT.z). */
function stripGeometry(count: number, fill: (i: number, put: (lon0: number, lat0: number, alt0: number, t0: number, lon1: number, lat1: number, alt1: number, t1: number, y: number, z: number) => void) => void): T.BufferGeometry {
  const aP = new Float32Array(count * 16);
  const aQ = new Float32Array(count * 16);
  const aS = new Float32Array(count * 8);
  const aT = new Float32Array(count * 12);
  const idx = new Uint32Array(count * 6);
  const a = new T.Vector3(), b = new T.Vector3();
  for (let i = 0; i < count; i++) {
    fill(i, (lon0, lat0, alt0, t0, lon1, lat1, alt1, t1, y, z) => {
      dirOf(lon0, lat0, a);
      dirOf(lon1, lat1, b);
      for (let v = 0; v < 4; v++) {
        const atA = v < 2;
        const p = atA ? a : b, q = atA ? b : a;
        aP.set([p.x, p.y, p.z, atA ? alt0 : alt1], i * 16 + v * 4);
        aQ.set([q.x, q.y, q.z, atA ? alt1 : alt0], i * 16 + v * 4);
        aS.set([v % 2 ? 1 : -1, atA ? 1 : -1], i * 8 + v * 2);
        aT.set([atA ? t0 : t1, y, z], i * 12 + v * 3);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    });
  }
  const g = new T.BufferGeometry();
  g.setAttribute("aP", new T.BufferAttribute(aP, 4));
  g.setAttribute("aQ", new T.BufferAttribute(aQ, 4));
  g.setAttribute("aS", new T.BufferAttribute(aS, 2));
  g.setAttribute("aT", new T.BufferAttribute(aT, 3));
  // three wants a position attribute to know how many vertices there are
  g.setAttribute("position", new T.BufferAttribute(new Float32Array(count * 12), 3));
  g.setIndex(new T.BufferAttribute(idx, 1));
  return g;
}

/** India's outline and state lines, and its neighbours' borders, as the map draws them
 *  (blue channel; the Earth itself is a photograph). */
function lineWork(input: OrbitInput, aniso: number): T.CanvasTexture {
  const RW = input.small ? 2048 : 4096;
  const RH = Math.round((RW * (REG.n - REG.s)) / (REG.e - REG.w));
  const px = (lon: number, lat: number): [number, number] => [((lon - REG.w) / (REG.e - REG.w)) * RW, ((REG.n - lat) / (REG.n - REG.s)) * RH];
  const rc = document.createElement("canvas");
  rc.width = RW;
  rc.height = RH;
  const g = rc.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, RW, RH);
  const trace = (rings: [number, number][][], close = true) => {
    for (const ring of rings) {
      ring.forEach(([lo, la], i) => (i ? g.lineTo(...px(lo, la)) : g.moveTo(...px(lo, la))));
      if (close) g.closePath();
    }
  };
  g.globalCompositeOperation = "lighter";
  g.lineJoin = "round";
  const k = RW / 4096;
  g.lineWidth = 1.1 * k + 0.3;
  g.strokeStyle = "rgba(0,0,255,0.36)";
  g.beginPath();
  trace(input.states, false);
  g.stroke();
  for (const c of input.region) {
    g.lineWidth = (c.iso === "IND" ? 2.6 : 1.4) * k + 0.4;
    g.strokeStyle = c.iso === "IND" ? "rgba(0,0,255,1)" : "rgba(0,0,255,0.4)";
    g.beginPath();
    trace(c.rings);
    g.stroke();
  }
  const t = new T.CanvasTexture(rc);
  t.anisotropy = aniso;
  return t;
}

/** Meteosat-9 is a Meteosat Second Generation satellite: a spinning drum covered in solar cells. */
function satellite(): T.Group {
  const g = new T.Group();
  const gold = new T.MeshStandardMaterial({ color: 0xd9b25a, metalness: 0.75, roughness: 0.32, emissive: 0x5a3d0c, emissiveIntensity: 0.8 });
  const cells = new T.MeshStandardMaterial({ color: 0x24457c, metalness: 0.55, roughness: 0.38, emissive: 0x12285a, emissiveIntensity: 1 });
  const band = new T.MeshStandardMaterial({ color: 0x0c1830, metalness: 0.4, roughness: 0.5 });
  const drum = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.8, 40, 1), cells);
  const top = new T.Mesh(new T.CylinderGeometry(0.565, 0.565, 0.07, 40), gold);
  top.position.y = 0.435;
  const bottom = top.clone();
  bottom.position.y = -0.435;
  g.add(drum, top, bottom);
  for (let i = 0; i < 16; i++) {
    const seam = new T.Mesh(new T.BoxGeometry(0.012, 0.8, 0.012), band);
    const a = (i / 16) * Math.PI * 2;
    seam.position.set(Math.cos(a) * 0.553, 0, Math.sin(a) * 0.553);
    g.add(seam);
  }
  const mast = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.62, 10), gold);
  mast.position.y = 0.78;
  const dish = new T.Mesh(new T.ConeGeometry(0.24, 0.2, 24, 1, true), gold);
  dish.position.y = 1.16;
  dish.rotation.x = Math.PI;
  const scope = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.22, 20), band);
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0.5, -0.05, 0);
  g.add(mast, dish, scope);
  return g;
}
