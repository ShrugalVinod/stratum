// Scroll films: a tall section whose stage stays pinned while the reader scrolls, so the scroll
// position plays the story like a video timeline. No animation library: one rAF loop per film
// eases a progress value p ∈ [0, 1] towards the scroll position, and every visual is a pure
// function of p. With reduced motion the film becomes a storyboard (each scene at its end state).
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { tx, useLang } from "../../i18n";
import { reduced } from "../motion";

export type Pair = [string, string]; // [English, Hindi]
export type Scene = { k: Pair; t: Pair; b: Pair };
export type Frame = { p: number; i: number; lp: number; n: number; still: boolean };

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** Progress of p through [a, b], clamped to 0–1. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeIo = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const L = (pair: Pair) => tx(pair[0], pair[1]);

/** Indian-style digit grouping, as the rest of the site does. */
export const nf = (v: number, d = 0) => v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Eased scroll progress through a tall element. */
function useScrollProgress(ref: { current: HTMLElement | null }, off: boolean) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (off) return;
    let raf = 0;
    let cur = -1;
    let target = 0;
    let last = 0;
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const stageH = el.firstElementChild instanceof HTMLElement ? el.firstElementChild.offsetHeight : innerHeight;
      target = clamp(-r.top / Math.max(1, r.height - stageH));
    };
    const frame = () => {
      raf = 0;
      measure();
      // a soft follow: scroll wheels move in steps, a film should not. Time-based, so a slow or
      // throttled device catches up instead of lagging behind the scroll.
      const now = performance.now();
      const dt = last ? Math.min(1000, now - last) : 16;
      last = now;
      const k = 1 - Math.exp(-dt / 95);
      const next = cur < 0 || Math.abs(target - cur) < 0.0004 ? target : cur + (target - cur) * k;
      if (next !== cur) {
        cur = next;
        setP(next);
      }
      if (cur !== target) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    frame();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
    };
  }, [off]);
  return p;
}

/** Caption opacity / offset for scene i of n at progress p (crossfades at the edges). */
function capStyle(p: number, i: number, n: number) {
  const s = i / n;
  const e = (i + 1) / n;
  const w = 0.22 / n;
  const a = i === 0 ? 1 : seg(p, s - w * 0.2, s + w);
  const b = i === n - 1 ? 1 : 1 - seg(p, e - w, e + w * 0.2);
  const o = Math.min(a, b);
  const y = (1 - a) * 28 - (1 - b) * 28;
  return { opacity: o, transform: `translate3d(0, ${y.toFixed(1)}px, 0)`, visibility: o < 0.01 ? "hidden" : "visible", filter: o < 0.98 ? `blur(${((1 - o) * 6).toFixed(1)}px)` : "none" } as const;
}

export function Film({
  id,
  label,
  scenes,
  vh = 130,
  skipTo,
  extra,
  aside = "left",
  children,
}: {
  id: string;
  label: Pair;
  scenes: Scene[];
  vh?: number;
  skipTo?: string;
  extra?: ComponentChildren;
  aside?: "left" | "right";
  children: (f: Frame) => ComponentChildren;
}) {
  useLang();
  const ref = useRef<HTMLElement>(null);
  const [still, setStill] = useState(false);
  useLayoutEffect(() => setStill(reduced()), []);
  const p = useScrollProgress(ref, still);
  const n = scenes.length;
  const i = Math.min(n - 1, Math.floor(p * n));
  const lp = clamp(p * n - i);

  const jump = (k: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + scrollY;
    const stageH = (el.firstElementChild as HTMLElement).offsetHeight;
    scrollTo({ top: top + ((k + 0.42) / n) * (el.offsetHeight - stageH), behavior: "smooth" });
  };
  const skip = () => {
    const t = skipTo && document.getElementById(skipTo);
    if (t) t.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };

  if (still)
    return (
      <section class="film film-still" id={id} aria-label={L(label)}>
        <p class="film-label mono-s">{L(label)}</p>
        {scenes.map((s, k) => (
          <div class="film-board">
            <div class="film-cap">
              <p class="film-k mono-s">{L(s.k)}</p>
              <h3 class="film-t">{L(s.t)}</h3>
              <p class="film-b">{L(s.b)}</p>
            </div>
            <div class="film-board-vis">{children({ p: (k + 0.93) / n, i: k, lp: 0.93, n, still: true })}</div>
          </div>
        ))}
        {extra && <div class="film-board-extra">{extra}</div>}
      </section>
    );

  return (
    <section ref={ref} class={`film film-${aside}`} id={id} aria-label={L(label)} style={{ height: `${n * vh}vh` }}>
      <div class="film-stage">
        <div class="film-vis">{children({ p, i, lp, n, still: false })}</div>
        <div class="film-shade" aria-hidden="true" />
        <div class="film-hud">
          <span class="film-label mono-s">{L(label)}</span>
          <div class="film-ticks" role="group" aria-label={tx("Scenes", "दृश्य")}>
            {scenes.map((s, k) => (
              <button
                type="button"
                class={k === i ? "on" : k < i ? "done" : ""}
                onClick={() => jump(k)}
                aria-label={`${tx("Scene", "दृश्य")} ${k + 1}: ${L(s.t)}`}
                aria-current={k === i ? "step" : undefined}
              >
                <i style={{ transform: `scaleX(${k < i ? 1 : k === i ? lp : 0})` }} />
              </button>
            ))}
          </div>
          <span class="film-count mono-s">
            {String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </span>
          {skipTo && (
            <button type="button" class="film-skip mono-s" onClick={skip}>
              {tx("Skip", "आगे बढ़ें")} ↓
            </button>
          )}
        </div>
        <div class="film-copy" aria-live="polite">
          {scenes.map((s, k) => (
            <div class="film-cap" style={capStyle(p, k, n)} aria-hidden={k !== i ? "true" : undefined}>
              <p class="film-k mono-s">{L(s.k)}</p>
              <h3 class="film-t">{L(s.t)}</h3>
              <p class="film-b">{L(s.b)}</p>
            </div>
          ))}
          {extra && (
            <div class="film-extra" style={{ opacity: seg(p, 1 - 0.5 / n, 1 - 0.15 / n), pointerEvents: p > 1 - 0.3 / n ? "auto" : "none" }}>
              {extra}
            </div>
          )}
        </div>
        <div class="film-hint mono-s" style={{ opacity: 1 - seg(p, 0, 0.02) }} aria-hidden="true">
          {tx("Scroll to play", "चलाने के लिए स्क्रॉल करें")}
          <span class="film-hint-line" />
        </div>
        <div class="film-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${p})` }} />
        </div>
      </div>
    </section>
  );
}

/** A hi-DPI canvas that redraws whenever `draw` changes (i.e. on every frame of the film). */
export function Canvas({ draw, class: cls, label }: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; class?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setSize([c.clientWidth, c.clientHeight]));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    const [w, h] = size;
    if (!c || !w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
  });
  return <canvas ref={ref} class={cls} role={label ? "img" : undefined} aria-label={label} />;
}

/** A number that counts with t (0–1). */
export function Num({ to, t, d = 0, from = 0 }: { to: number; t: number; d?: number; from?: number }) {
  return <>{nf(lerp(from, to, easeOut(clamp(t))), d)}</>;
}

/** Stamp that slams in when t crosses 0. */
export function Stamp({ t, kind, children }: { t: number; kind: "yes" | "no" | "info"; children: ComponentChildren }) {
  const k = clamp(t * 4);
  return (
    <span class={`film-stamp ${kind}`} style={{ opacity: k, transform: `rotate(-6deg) scale(${lerp(1.8, 1, easeOut(k))})` }}>
      {children}
    </span>
  );
}
