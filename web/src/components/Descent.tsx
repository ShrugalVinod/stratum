// The page as a descent: an altitude tape in the right margin. The aircraft comes down it as the
// page scrolls, from FL430 at the top to the runway at the bottom. Passing through the humid
// layer (FL380–FL360) it leaves a contrail that stays on the tape; everywhere else its trail is
// a short streak. It steps aside while a scroll film or a full-screen tool has the window.
import { useLocation } from "preact-iso";
import { useEffect, useRef } from "preact/hooks";

const TOP_FL = 430;
const LEVELS = [430, 380, 360, 300, 240, 180, 100];
const at = (fl: number) => `${(((TOP_FL - fl) / TOP_FL) * 100).toFixed(2)}%`;

export function Descent() {
  const { path } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = el.querySelector<HTMLElement>(".ds-read")!;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      el.style.setProperty("--p", p.toFixed(4));
      const ft = Math.round((TOP_FL * 100 * (1 - p)) / 100) * 100;
      read.textContent = p > 0.992 ? "TOUCHDOWN" : ft >= 18_000 ? `FL${String(Math.round(ft / 100)).padStart(3, "0")}` : `${ft.toLocaleString("en-US")} FT`;
      // the lasting contrail: drawn through the layer as the aircraft crosses it, and it stays
      const a = (TOP_FL - 380) / TOP_FL, b = (TOP_FL - 360) / TOP_FL;
      el.style.setProperty("--k", Math.min(1, Math.max(0, (p - a) / (b - a))).toFixed(3));
      const mid = innerHeight / 2;
      const busy = [...document.querySelectorAll(".film:not(.film-still)")].some((f) => {
        const r = f.getBoundingClientRect();
        return r.top < mid && r.bottom > mid;
      });
      el.classList.toggle("off", busy || max < innerHeight * 0.7 || !!document.querySelector("main.is-map"));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    const late = setTimeout(update, 900); // a lazy page has its full height a moment later
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      clearTimeout(late);
      cancelAnimationFrame(raf);
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
    };
  }, [path]);

  return (
    <div class="descent off" ref={ref} aria-hidden="true">
      <span class="ds-line" />
      {LEVELS.map((fl) => (
        <i class="ds-tick mono-s" style={{ top: at(fl) }}>
          {fl}
        </i>
      ))}
      <span class="ds-layer" style={{ top: at(380), height: `${((380 - 360) / TOP_FL) * 100}%` }} />
      <span class="ds-stay" style={{ top: at(380), height: `${((380 - 360) / TOP_FL) * 100}%` }} />
      <i class="ds-gnd mono-s">RWY</i>
      <span class="ds-plane">
        <span class="ds-trail" />
        <svg viewBox="0 0 20 24" width="16" height="19">
          <path d="M10 24c-1.2 0-2-1.8-2-4.4V14L0 9.5V7l8 2.2V4.4L5.2 2.2V.6L10 1.8 14.800.6v1.600L12 4.400V9.200L20 7v2.500l-8 4.500v5.600c0 2.600-.8 4.400-2 4.400Z" />
        </svg>
        <span class="ds-read mono-s" />
      </span>
    </div>
  );
}
