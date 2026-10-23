// Motion engine. Everything is opt-in by class:
//   .rv (+ .rv-fade/.rv-left/.rv-scale/.stagger/.sec-head/.split) → gets .in when it enters the view
//   [data-flap]  → split-flap: letters spin through the alphabet, then land (departures board)
//   [data-count] → number counts up from 0 (keeps the element's own formatting)
// Respects prefers-reduced-motion: everything is shown at once, nothing spins.
export const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FLAP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·–";

function flap(el: HTMLElement) {
  const final = el.dataset.flap ?? el.textContent ?? "";
  // letters spin one by one: fine for the Latin alphabet, but it would tear apart the joined
  // letters of Devanagari (Hindi), so other scripts simply show their final text
  if (reduced() || el.dataset.done || /[^\u0000-\u024f·–—]/.test(final)) return;
  el.dataset.done = "1";
  const delay = Number(el.dataset.flapDelay ?? 0);
  const spans = [...final].map((ch) => {
    const s = document.createElement("span");
    s.textContent = ch === " " ? " " : FLAP_CHARS[(Math.random() * FLAP_CHARS.length) | 0];
    return s;
  });
  el.replaceChildren(...spans);
  el.setAttribute("aria-label", final);
  const start = performance.now() + delay;
  const stops = [...final].map((_, i) => 260 + i * 34 + Math.random() * 180);
  let lastSwap = 0;
  const tick = (now: number) => {
    if (now < start) return requestAnimationFrame(tick);
    const t = now - start;
    const swap = now - lastSwap > 55;
    if (swap) lastSwap = now;
    let busy = false;
    spans.forEach((s, i) => {
      const ch = final[i];
      if (ch === " ") return;
      if (t >= stops[i]) {
        if (s.textContent !== ch) s.textContent = ch;
      } else {
        busy = true;
        if (swap) s.textContent = FLAP_CHARS[(Math.random() * FLAP_CHARS.length) | 0];
      }
    });
    if (busy) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  requestAnimationFrame(tick);
}

function count(el: HTMLElement) {
  if (el.dataset.done) return;
  el.dataset.done = "1";
  const target = Number(el.dataset.count);
  if (reduced() || !Number.isFinite(target)) return;
  const fmt = new Intl.NumberFormat("en-IN");
  const dur = 1600;
  const t0 = performance.now() + Number(el.dataset.countDelay ?? 0);
  const step = (now: number) => {
    const k = Math.max(0, Math.min(1, (now - t0) / dur));
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt.format(Math.round(target * e));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = "0";
  requestAnimationFrame(step);
}

function arrive(el: Element) {
  el.classList.add("in");
  el.querySelectorAll<HTMLElement>("[data-flap]").forEach(flap);
  el.querySelectorAll<HTMLElement>("[data-count]").forEach(count);
  if (el instanceof HTMLElement && el.dataset.count) count(el);
}

export function startMotion(): () => void {
  document.documentElement.classList.add("js");
  const seen = new WeakSet<Element>();
  const io =
    "IntersectionObserver" in window && !reduced()
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((e) => {
              if (e.isIntersecting) {
                arrive(e.target);
                io?.unobserve(e.target);
              }
            }),
          { rootMargin: "0px 0px -9% 0px", threshold: 0.12 },
        )
      : null;
  const scan = () =>
    document.querySelectorAll(".rv:not(.in), .split:not(.in), .rule-draw:not(.in)").forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (io) io.observe(el);
      else arrive(el);
    });
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });

  // header: compact after scrolling + reading-progress meter
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = window.scrollY;
      const h = document.documentElement.scrollHeight - innerHeight;
      document.querySelector(".site-header")?.classList.toggle("compact", y > 24);
      const m = document.querySelector<HTMLElement>(".scroll-meter");
      if (m) m.style.transform = `scaleX(${h > 0 ? Math.min(1, y / h) : 0})`;
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  return () => {
    mo.disconnect();
    io?.disconnect();
    removeEventListener("scroll", onScroll);
  };
}

// ── theme ────────────────────────────────────────────────────────────────
export type Theme = "light" | "dark";
export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(next: Theme) {
  const root = document.documentElement;
  const apply = () => {
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0D1623" : "#F1ECE1");
    try {
      localStorage.setItem("stratum-theme", next);
    } catch {
      /* private mode: not remembered */
    }
    window.dispatchEvent(new CustomEvent("stratum-theme", { detail: next }));
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (reduced()) return apply();
  if (doc.startViewTransition) {
    root.classList.add(next === "dark" ? "vt-dusk" : "vt-dawn");
    const t = doc.startViewTransition(apply);
    t.finished.finally(() => root.classList.remove("vt-dusk", "vt-dawn"));
    return;
  }
  root.classList.add("theming");
  apply();
  setTimeout(() => root.classList.remove("theming"), 700);
}
