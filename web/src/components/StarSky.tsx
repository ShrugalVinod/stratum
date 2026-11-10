// The sky behind every page is the real one: the 9,096 stars of the Yale Bright Star Catalogue
// (Hoffleit & Warren, 5th ed.) at their true places, brightness and colour, so Orion, Sirius and
// the Pleiades are where they belong. Under them a statistical field of fainter stars and the
// glow of the Milky Way along the galactic plane (those two are drawn from a seeded formula, not
// a catalogue). The view starts high on the winter Milky Way, as it stands over India on
// December evenings, and tilts south as the page scrolls, so reading a page is a slow descent
// through the sky. A few lines of WebGL, no library; without WebGL the page keeps a plain sky.
import { useEffect, useRef } from "preact/hooks";
import { reduced } from "./motion";

const RAD = Math.PI / 180;
const RA0 = 86; // the meridian of Orion
const DEC_TOP = 30; // where the view points at the top of a page …
const DEC_PER_PX = 0.0052; // … and how fast it tilts south with the scroll
const DEC_MIN = -58;

// galactic → equatorial (J2000)
const G2E = [
  [-0.0548755604, 0.4941094279, -0.867666149],
  [-0.8734370902, -0.44482963, -0.1980763734],
  [-0.4838350155, 0.7469822445, 0.4559837762],
];
const galactic = (l: number, b: number): [number, number, number] => {
  const x = Math.cos(b * RAD) * Math.cos(l * RAD), y = Math.cos(b * RAD) * Math.sin(l * RAD), z = Math.sin(b * RAD);
  return [G2E[0][0] * x + G2E[0][1] * y + G2E[0][2] * z, G2E[1][0] * x + G2E[1][1] * y + G2E[1][2] * z, G2E[2][0] * x + G2E[2][1] * y + G2E[2][2] * z];
};

/** A star's colour from its temperature (black-body, softened towards white as the eye sees it). */
function tint(k: number): [number, number, number] {
  const t = Math.min(400, Math.max(10, (k || 6500) / 100));
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => 1 - 0.62 * (1 - Math.min(255, Math.max(0, v)) / 255);
  return [c(r), c(g), c(b)];
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aCol;
attribute vec4 aMag; // size (px), brightness, twinkle seed (0 = steady), soft (1 = Milky Way glow)
uniform mat3 uView;
uniform vec2 uScale;
uniform float uPx;
uniform float uTime;
varying vec4 vCol;
varying float vSoft;
void main() {
  vec3 v = uView * aPos;
  if (v.z < 0.1) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  gl_Position = vec4(v.x / v.z * uScale.x, v.y / v.z * uScale.y, 0.0, 1.0);
  float tw = aMag.z > 0.0 ? 1.0 + 0.2 * sin(uTime * (1.6 + fract(aMag.z * 7.13) * 3.4) + aMag.z * 50.0) : 1.0;
  gl_PointSize = aMag.x * uPx;
  vCol = vec4(aCol, aMag.y * tw);
  vSoft = aMag.w;
}`;
const FRAG = `
precision mediump float;
varying vec4 vCol;
varying float vSoft;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vSoft > 0.5 ? pow(max(1.0 - d, 0.0), 2.2) : smoothstep(1.0, 0.18, d);
  gl_FragColor = vec4(vCol.rgb * vCol.a * a, 0.0);
}`;

export function StarSky() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) return;
    let dead = false;
    let raf = 0;
    let timer = 0;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uView = U("uView"), uScale = U("uScale"), uPx = U("uPx"), uTime = U("uTime");

    let count = 0;
    const build = (cat: DataView | null) => {
      const data: number[] = [];
      let seed = 86_0530;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const push = (p: [number, number, number], c: [number, number, number], size: number, a: number, tw: number, soft: number) => data.push(p[0], p[1], p[2], c[0], c[1], c[2], size, a, tw, soft);
      // the Milky Way: a soft glow along the galactic plane, brighter and warmer towards its centre
      for (let i = 0; i < 900; i++) {
        const l = rnd() * 360;
        const dl = Math.min(l, 360 - l);
        const w = 0.42 + 0.58 * Math.exp(-((dl / 58) ** 2));
        if (rnd() > w) continue;
        const b = (rnd() + rnd() + rnd() - 1.5) * (7 + 6 * w);
        const warm = Math.exp(-((dl / 70) ** 2));
        push(galactic(l, b), [0.78 + 0.22 * warm, 0.86 + 0.06 * warm, 1 - 0.2 * warm], 80 + rnd() * 110, (0.011 + rnd() * 0.02) * (0.55 + w), 0, 1);
      }
      // stars too faint for the catalogue: more of them near the plane
      for (let i = 0; i < 26_000; i++) {
        const l = rnd() * 360;
        const inPlane = rnd() < 0.68;
        const b = inPlane ? Math.log(1 - rnd() * 0.999) * 9.5 * (rnd() < 0.5 ? -1 : 1) : Math.asin(rnd() * 2 - 1) / RAD;
        if (Math.abs(b) > 89) continue;
        const m = 6.6 + 3 * Math.pow(rnd(), 0.62);
        push(galactic(l, b), tint(3800 + rnd() * rnd() * 9000), 1.1 + rnd() * 0.55, 0.6 * Math.exp(-0.42 * (m - 6.6)) * (0.6 + rnd() * 0.6), 0, 0);
      }
      // the catalogue
      if (cat)
        for (let o = 0; o + 8 <= cat.byteLength; o += 8) {
          const ra = (cat.getUint16(o, true) / 65536) * 360 * RAD;
          const dec = (cat.getInt16(o + 2, true) / 32767) * 90 * RAD;
          const m = cat.getInt16(o + 4, true) / 100;
          const k = cat.getUint16(o + 6, true);
          const p: [number, number, number] = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
          const c = tint(k);
          const size = 1.35 + 6.2 * Math.exp(-0.4 * (m + 1.5));
          const a = Math.min(1, 1.15 * Math.exp(-0.31 * Math.max(0, m)));
          push(p, c, size, a, m < 4.6 ? 0.05 + rnd() : 0, 0);
          if (m < 1.6) push(p, c, size * 4.2, 0.085 * Math.exp(-0.3 * (m + 1.5)), 0.05 + rnd(), 1); // a little glare around the brightest
        }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      const A = (n: string, size: number, off: number) => {
        const loc = gl.getAttribLocation(prog, n);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, off);
      };
      A("aPos", 3, 0);
      A("aCol", 3, 12);
      A("aMag", 4, 24);
      count = data.length / 10;
    };

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const t0 = performance.now();
    const draw = () => {
      raf = 0;
      if (dead || !count || !W) return;
      const time = (performance.now() - t0) / 1000;
      const dec = Math.max(DEC_MIN, DEC_TOP - scrollY * DEC_PER_PX) * RAD;
      const ra = (RA0 + time * 0.004) * RAD; // the sky drifts, very slowly
      const f = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
      const up = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)]; // towards celestial north
      const r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]; // east is to the left, as in the real sky
      gl.uniformMatrix3fv(uView, false, new Float32Array([r[0], up[0], f[0], r[1], up[1], f[1], r[2], up[2], f[2]]));
      const fov = (W < H ? 82 : 60) * RAD;
      const k = 1 / Math.tan(fov / 2);
      gl.uniform2f(uScale, (k * H) / W, k);
      gl.uniform1f(uPx, dpr * Math.max(0.85, Math.min(1.3, H / 900)));
      gl.uniform1f(uTime, time);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
    };
    const ask = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(draw);
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    size();
    fetch("/geo/stars.bin")
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
      .then((b) => {
        if (dead) return;
        build(b ? new DataView(b) : null);
        document.documentElement.classList.add("has-sky");
        draw();
        // stars twinkle a dozen times a second; scrolling redraws at once
        if (!reduced()) timer = window.setInterval(ask, 85);
      });
    const onResize = () => {
      size();
      ask();
    };
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", onResize);
    return () => {
      dead = true;
      clearInterval(timer);
      cancelAnimationFrame(raf);
      removeEventListener("scroll", ask);
      removeEventListener("resize", onResize);
      document.documentElement.classList.remove("has-sky");
    };
  }, []);

  return <canvas ref={ref} class="star-sky" aria-hidden="true" />;
}
