// Every page ends on a runway at night, seen from just before the threshold, a few metres up.
// It is drawn the way a camera would see it, not as a diagram: worn asphalt and paint, rubber in
// the touchdown zone, and the real lighting of an instrument runway (green threshold, white
// edge and centre-line lights turning amber and red towards the far end, touchdown-zone
// barrettes, a PAPI showing two white and two red, blue taxiway lights), each with its glow
// and the pool of light it throws on the ground. The page's own scroll lands an aircraft: at
// night you see it by its lights and by the beam it lays on the runway.
// One fragment shader on a quad; no library. Without WebGL the footer simply has no picture.
import { useEffect, useRef } from "preact/hooks";
import { reduced } from "./motion";

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uQ;
uniform float uPx;
const float HE = 14.0;    // eye height above the ground, m
const float D0 = 20.0;    // distance to the threshold, m
const float RW = 22.5;    // half the runway's width, m
const float LEN = 2800.0; // its length, m

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}
float sat(float x) { return clamp(x, 0.0, 1.0); }
// coverage of an axis-aligned rectangle (centre c, half-size h) by a pixel whose footprint is aa
float rect(vec2 p, vec2 c, vec2 h, vec2 aa) {
  vec2 d = abs(p - c) - h;
  return sat(0.5 - d.x / aa.x) * sat(0.5 - d.y / aa.y);
}

// white paint, in runway coordinates: x across (m), z along from the threshold (m)
float paint(vec2 p, vec2 aa) {
  float x = p.x, z = p.y, ax = abs(x), c = 0.0;
  if (z < -1.0 || z > LEN) return 0.0;
  c = max(c, rect(vec2(ax, z), vec2(RW - 0.95, LEN * 0.5), vec2(0.45, LEN * 0.5), aa));            // side stripes
  if (z < 40.0) {                                                                                     // threshold "piano keys"
    float k = floor((ax - 2.1) / 3.6);
    if (k >= 0.0 && k <= 5.0) c = max(c, rect(vec2(ax, z), vec2(3.0 + k * 3.6, 21.0), vec2(0.9, 15.0), aa));
  } else if (z < 70.0) {                                                                              // the number: 09
    vec2 q = vec2(x + 4.6, z - 48.0);
    c = max(c, rect(q, vec2(0.0, 9.0), vec2(3.0, 9.0), aa) * (1.0 - rect(q, vec2(0.0, 9.0), vec2(1.55, 7.5), aa)));
    q = vec2(x - 4.6, z - 48.0);
    float nine = rect(q, vec2(0.0, 13.0), vec2(3.0, 5.0), aa) * (1.0 - rect(q, vec2(0.0, 13.0), vec2(1.55, 3.5), aa));
    nine = max(nine, rect(q, vec2(2.28, 4.0), vec2(0.72, 4.0), aa));
    nine = max(nine, rect(q, vec2(0.0, 0.75), vec2(3.0, 0.75), aa));
    c = max(c, nine);
  } else {
    float d = mod(z - 80.0, 50.0);                                                                    // centre line
    if (z > 80.0) c = max(c, rect(vec2(x, d), vec2(0.0, 15.0), vec2(0.45, 15.0), aa));
    if (z > 300.0 && z < 362.0) c = max(c, rect(vec2(ax, z), vec2(9.2, 330.0), vec2(3.6, 30.0), aa)); // aiming point
    for (int i = 0; i < 5; i++) {                                                                     // touchdown-zone bars
      float zc = 150.0 + float(i) * 150.0 + (i > 0 ? 150.0 : 0.0);
      float n = i == 0 ? 3.0 : i < 3 ? 2.0 : 1.0;
      float k = floor((ax - 8.25) / 3.3);
      if (k >= 0.0 && k < n) c = max(c, rect(vec2(ax, z), vec2(9.15 + k * 3.3, zc + 11.0), vec2(0.9, 11.0), aa));
    }
  }
  return c;
}

// a point of light seen through a lens: a hard core and a long soft halo
float lamp(vec2 px, vec2 at, float s) {
  vec2 d = px - at;
  float g = s * s / (dot(d, d) + s * s);
  return g * g * 1.6 + g * 0.09;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  px.y = uRes.y - px.y;
  float f = 0.9 * uRes.y;
  float yh = 0.36 * uRes.y;
  float cx = 0.5 * uRes.x;
  float dy = px.y - yh;
  float t = uTime;

  // the aircraft: where it is on its approach (q < 0.86), touchdown, roll-out
  float s = min(1.0, uQ / 0.86);
  float roll = max(0.0, (uQ - 0.86) / 0.14);
  float za = uQ < 0.86 ? 8.0 + 182.0 * pow(s, 1.25) : 190.0 + 110.0 * (1.0 - (1.0 - roll) * (1.0 - roll));
  float ha = (uQ < 0.86 ? 40.0 * pow(1.0 - s, 1.6) : 0.0) + 3.4;
  float sc = f / za;
  vec2 ac = vec2(cx, yh + f * (HE - ha) / za);
  float shown = sat(uQ * 30.0);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (dy > 0.0) {
    // ── the ground ──
    float Z = HE * f / dy;
    float X = (px.x - cx) * Z / f;
    vec2 aa = vec2(Z / f, Z * Z / (HE * f)) * 1.4 + 0.02;
    float z = Z - D0;
    bool on = abs(X) < RW && z > 0.0 && z < LEN;
    float grain = fbm(vec2(X * 2.3, Z * 2.3));
    float seams = smoothstep(0.92, 1.0, sin(X * 1.396) * 0.5 + 0.5) * 0.25 + smoothstep(0.985, 1.0, sin(z * 0.418)) * 0.2;
    vec3 tar = vec3(0.052, 0.055, 0.062) * (0.72 + 0.56 * grain) * (1.0 - seams * sat(1.5 - aa.y));
    // rubber laid down by thousands of landings
    float rub = sat(1.0 - abs(z - 330.0) / 290.0) * smoothstep(11.0, 2.0, abs(abs(X) - 5.2)) * (0.45 + 0.55 * fbm(vec2(X * 1.7, z * 0.022)));
    tar *= 1.0 - 0.62 * rub;
    float p = on ? paint(vec2(X, z), aa) * (0.5 + 0.5 * fbm(vec2(X * 0.9, z * 0.55))) * (1.0 - 0.75 * rub) : 0.0;
    vec3 albedo = on ? mix(tar, vec3(0.5, 0.5, 0.47), p) : vec3(0.016, 0.022, 0.014) * (0.6 + 0.8 * fbm(vec2(X * 0.5, Z * 0.5)));
    if (!on && z < 0.0 && abs(X) < RW + 6.0) albedo = vec3(0.04, 0.042, 0.046) * (0.7 + 0.5 * grain); // the paved overrun before the threshold

    // light that reaches the ground: the night sky, the edge lights' pools, the threshold bar, the landing beam
    vec3 E = vec3(0.045, 0.06, 0.1);
    float ze = floor(max(z, 0.0) / 60.0 + 0.5) * 60.0;
    for (int j = -1; j <= 1; j++) {
      float zl = ze + float(j) * 60.0;
      if (zl < 0.0 || zl > LEN) continue;
      vec3 lc = zl > LEN - 600.0 ? vec3(1.0, 0.7, 0.3) : vec3(1.0, 0.93, 0.8);
      float dl = min(abs(X - RW - 1.5), abs(X + RW + 1.5));
      E += lc * 34.0 / (dl * dl + (z - zl) * (z - zl) + 9.0);
    }
    E += vec3(0.2, 1.0, 0.45) * 26.0 / (z * z + 12.0) * step(abs(X), RW + 3.0);
    float zb = za + 34.0 + ha * 5.0;
    float beam = exp(-(X * X) / 330.0 - (Z - zb) * (Z - zb) / (1700.0 + ha * 90.0)) * smoothstep(52.0, 3.4, ha) * shown;
    E += vec3(1.0, 0.97, 0.9) * beam * 5.5;
    col = albedo * E;
    // haze eats the distance
    float fog = 1.0 - exp(-Z / 2300.0);
    col = mix(col, vec3(0.022, 0.03, 0.05), fog);
    alpha = 1.0;
  } else {
    // ── the sky just above the horizon: airport haze, lit from below ──
    float up = -dy / uRes.y;
    float haze = exp(-up * 9.0);
    col = (vec3(0.05, 0.07, 0.13) + vec3(0.16, 0.1, 0.05) * exp(-pow((px.x - cx) / (0.42 * uRes.x), 2.0))) * haze;
    alpha = haze * 0.92;
  }

  // ── the lights themselves ──
  vec3 L = vec3(0.0);
  float dyc = max(dy, 0.75);
  float Zp = HE * f / dyc;
  float flick = 0.86 + 0.14 * noise(vec2(t * 2.3, px.y * 0.05));
  // runway edge, both sides, every 60 m
  float i0 = floor((Zp - D0) / 60.0 + 0.5);
  for (int j = -2; j <= 2; j++) {
    float i = i0 + float(j);
    if (i < 0.0 || i > 46.0) continue;
    float zl = D0 + i * 60.0;
    vec3 lc = i * 60.0 > LEN - 600.0 ? vec3(1.0, 0.66, 0.24) : vec3(1.0, 0.92, 0.76);
    float sz = (1.15 + 0.34 * f / zl) * uPx;
    float y = yh + f * (HE - 0.4) / zl;
    float att = exp(-zl / 4200.0) * flick;
    L += lc * (lamp(px, vec2(cx + (RW + 1.5) * f / zl, y), sz) + lamp(px, vec2(cx - (RW + 1.5) * f / zl, y), sz)) * 2.4 * att;
  }
  // centre line, every 15 m; red and white, then red, towards the far end
  i0 = floor((Zp - D0 - 30.0) / 15.0 + 0.5);
  for (int j = -2; j <= 2; j++) {
    float i = i0 + float(j);
    if (i < 0.0 || i > 184.0) continue;
    float zl = D0 + 30.0 + i * 15.0;
    float left = LEN - (zl - D0);
    vec3 lc = left < 300.0 ? vec3(1.0, 0.16, 0.12) : left < 900.0 && mod(i, 2.0) < 1.0 ? vec3(1.0, 0.16, 0.12) : vec3(1.0, 0.96, 0.88);
    L += lc * lamp(px, vec2(cx, yh + f * HE / zl), (0.8 + 0.2 * f / zl) * uPx) * 1.5 * exp(-zl / 4200.0);
  }
  // touchdown-zone barrettes: three lights each side, every 30 m for the first 900 m
  i0 = floor((Zp - D0 - 30.0) / 30.0 + 0.5);
  for (int j = -1; j <= 1; j++) {
    float i = i0 + float(j);
    if (i < 0.0 || i > 29.0) continue;
    float zl = D0 + 30.0 + i * 30.0;
    float sz = (0.75 + 0.18 * f / zl) * uPx;
    float y = yh + f * HE / zl;
    for (int k = 0; k < 3; k++) {
      float xo = (8.2 + float(k) * 1.5) * f / zl;
      L += vec3(1.0, 0.96, 0.88) * (lamp(px, vec2(cx + xo, y), sz) + lamp(px, vec2(cx - xo, y), sz)) * 0.9 * exp(-zl / 4200.0);
    }
  }
  // threshold: a bar of green; far end: a bar of red
  float yt = yh + f * (HE - 0.3) / D0;
  if (abs(px.y - yt) < 46.0 * uPx)
    for (int k = 0; k < 16; k++) {
      float xo = (-22.5 + float(k) * 3.0) * f / D0;
      L += vec3(0.16, 1.0, 0.42) * lamp(px, vec2(cx + xo, yt), 5.5 * uPx) * 2.6;
    }
  float ye = yh + f * HE / (D0 + LEN);
  if (abs(px.y - ye) < 10.0 * uPx)
    for (int k = 0; k < 9; k++) L += vec3(1.0, 0.14, 0.1) * lamp(px, vec2(cx + (-20.0 + float(k) * 5.0) * f / (D0 + LEN), ye), 1.0 * uPx) * 1.6;
  // PAPI, left of the touchdown zone: two white, two red means "on the glide path"
  float zpapi = D0 + 300.0;
  for (int k = 0; k < 4; k++) {
    vec3 lc = k < 2 ? vec3(1.0, 0.98, 0.92) : vec3(1.0, 0.1, 0.08);
    L += lc * lamp(px, vec2(cx + (-58.0 + float(k) * 9.0) * f / zpapi, yh + f * (HE - 0.8) / zpapi), 1.9 * uPx) * 3.4;
  }
  // a taxiway to the right, edged in blue
  i0 = floor((Zp - 90.0) / 30.0 + 0.5);
  for (int j = -1; j <= 1; j++) {
    float i = i0 + float(j);
    if (i < 0.0 || i > 40.0) continue;
    float zl = 90.0 + i * 30.0;
    float y = yh + f * (HE - 0.3) / zl;
    float sz = (0.8 + 0.2 * f / zl) * uPx;
    L += vec3(0.2, 0.42, 1.0) * (lamp(px, vec2(cx + 96.0 * f / zl, y), sz) + lamp(px, vec2(cx + 119.0 * f / zl, y), sz)) * 1.5 * exp(-zl / 3000.0);
  }
  // the airport and the town beyond it, along the horizon
  if (abs(dy) < 30.0 * uPx)
    for (int k = 0; k < 46; k++) {
      float fk = float(k);
      float zl = 1400.0 + hash(vec2(fk, 1.7)) * 5200.0;
      float xl = (hash(vec2(fk, 9.2)) * 2.0 - 1.0) * (500.0 + zl * 0.9);
      if (abs(xl) < 70.0) xl += 180.0;
      float hl = 2.0 + hash(vec2(fk, 4.4)) * 24.0;
      float kind = hash(vec2(fk, 6.6));
      vec3 lc = kind < 0.12 ? vec3(1.0, 0.12, 0.08) * step(0.5, fract(t * 0.5 + fk * 0.37)) : kind < 0.55 ? vec3(1.0, 0.72, 0.36) : vec3(0.9, 0.95, 1.0);
      L += lc * lamp(px, vec2(cx + xl * f / zl, yh + f * (HE - hl) / zl), (0.75 + 0.35 * hash(vec2(fk, 2.1))) * uPx) * (0.5 + 0.9 * hash(vec2(fk, 3.3))) * (0.8 + 0.2 * noise(vec2(t * 3.0, fk)));
    }

  // ── the aircraft: a dark shape against the lights, and its own lights ──
  if (shown > 0.0) {
    vec2 q = (px - ac) / sc; // metres, from behind: x to the right, y down
    float body = length(q) - 2.05;
    body = min(body, max(abs(q.x) - 17.2, abs(q.y - 0.55 + abs(q.x) * 0.045) - 0.34));       // wings, with a little dihedral
    body = min(body, max(abs(q.x) - 6.3, abs(q.y + 1.5) - 0.2));                               // tailplane
    body = min(body, max(abs(q.x) - 0.32, abs(q.y + 5.2) - 3.6));                              // fin
    body = min(body, length(vec2(abs(q.x) - 5.6, q.y - 1.9)) - 1.15);                          // engines
    if (ha < 30.0) body = min(body, max(abs(abs(q.x) - 2.7) - 0.45, abs(q.y - 2.9) - 1.0));   // main gear, down
    // its landing lights point away from us: what we see is their glow in the night air ahead,
    // and the aircraft standing dark against it
    vec2 hz = (px - ac - vec2(0.0, 2.2) * sc) / (sc * vec2(26.0, 9.0));
    vec3 hazeGlow = vec3(1.0, 0.96, 0.88) * exp(-dot(hz, hz)) * 0.34 * smoothstep(70.0, 6.0, ha) * shown;
    col += hazeGlow;
    alpha = max(alpha, sat(hazeGlow.r * 2.2));
    float inside = sat(0.5 - body * sc * 0.9) * shown;
    float beaconNow = smoothstep(0.12, 0.0, abs(fract(t * 0.95) - 0.5) - 0.02);
    // what the eye makes out at night: a grey shape under the airport's glow, the fin lit by its logo
    // lights, the red beacon washing over the fuselage
    vec3 skin = vec3(0.05, 0.056, 0.068) * (0.7 + 0.6 * sat(0.5 - q.y * 0.25)) + vec3(0.2, 0.014, 0.01) * beaconNow * exp(-dot(q, q) / 30.0);
    skin += vec3(0.16, 0.15, 0.12) * sat(q.y * 0.5 + 0.3) * smoothstep(26.0, 3.4, ha); // the runway's own light on its belly
    float fin = sat(0.5 - max(abs(q.x) - 0.32, abs(q.y + 5.2) - 3.6) * sc);
    skin = mix(skin, vec3(0.5, 0.53, 0.58) * (0.55 + 0.45 * sat(-(q.y + 2.0) / 6.0)), fin * 0.85);
    col = mix(col, skin, inside);
    L *= 1.0 - inside;
    alpha = max(alpha, inside);
    float strobe = step(fract(t * 0.8), 0.045) + step(abs(fract(t * 0.8) - 0.16), 0.022);
    float beacon = beaconNow;
    float ls = (1.2 + 0.07 * sc) * uPx;
    L += shown * vec3(1.0, 0.97, 0.9) * lamp(px, ac + vec2(0.0, -0.9) * sc, ls) * 3.2;                                    // tail light
    L += shown * vec3(1.0, 0.1, 0.08) * (lamp(px, ac + vec2(0.0, -2.2) * sc, ls * 1.4) + lamp(px, ac + vec2(0.0, 2.2) * sc, ls * 1.4)) * 5.0 * beacon;
    L += shown * vec3(1.0) * (lamp(px, ac + vec2(-17.2, 0.3) * sc, ls * 1.5) + lamp(px, ac + vec2(17.2, 0.3) * sc, ls * 1.5)) * 9.0 * strobe;
    L += shown * (vec3(1.0, 0.1, 0.08) * lamp(px, ac + vec2(-17.2, 0.3) * sc, ls) + vec3(0.1, 1.0, 0.35) * lamp(px, ac + vec2(17.2, 0.3) * sc, ls)) * 2.4;
    // the glare of its landing lights, spilling round the fuselage as it looks down the runway
    L += shown * vec3(1.0, 0.96, 0.88) * lamp(px, ac + vec2(0.0, 1.2) * sc, (2.0 + 0.5 * sc) * uPx) * 0.5 * smoothstep(60.0, 4.0, ha);
  }

  col += L;
  alpha = max(alpha, sat(max(L.r, max(L.g, L.b)) * 1.4));
  // film: a soft shoulder instead of clipping, and a little grain
  col = 1.0 - exp(-col * 1.55);
  col += (hash(px + fract(t) * 91.0) - 0.5) * 0.012;
  gl_FragColor = vec4(col * alpha, alpha);
}`;

const VERT = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";

export function Runway() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const box = canvas.parentElement!;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return;
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
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime"), uQ = gl.getUniformLocation(prog, "uQ"), uPx = gl.getUniformLocation(prog, "uPx");
    box.classList.add("lit");

    const still = reduced();
    let dpr = 1, raf = 0, timer = 0, seen = false;
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const t0 = performance.now();
    const draw = () => {
      raf = 0;
      if (!seen && !still) return;
      const r = box.getBoundingClientRect();
      const q = still ? 0.9 : Math.min(1, Math.max(0, (innerHeight - r.top) / Math.max(1, r.height)));
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, still ? 3.1 : (performance.now() - t0) / 1000);
      gl.uniform1f(uQ, q);
      gl.uniform1f(uPx, dpr * Math.max(0.7, canvas.clientHeight / 540));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      box.classList.toggle("down", q >= 0.86);
    };
    const ask = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    size();
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      if (seen) ask();
    });
    io.observe(box);
    if (still) draw();
    else timer = window.setInterval(() => seen && !document.hidden && ask(), 50); // strobes and beacons
    const onResize = () => {
      size();
      ask();
    };
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", onResize);
    return () => {
      io.disconnect();
      clearInterval(timer);
      cancelAnimationFrame(raf);
      removeEventListener("scroll", ask);
      removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div class="runway" aria-hidden="true">
      <p class="footer-mark">STRATUM</p>
      <canvas ref={ref} />
      <p class="runway-note mono-s">
        <span class="rn-app">RWY 09 · cleared to land</span>
        <span class="rn-down">RWY 09 · touchdown</span>
      </p>
    </div>
  );
}
