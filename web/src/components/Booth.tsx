import { useEffect, useRef, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { T } from "../i18n";

/** Booth mode for the Summit expo (build prompt §8.2): open the site with ?booth=1 and it tours
 *  map → the busiest alert day's top avoidance alert and its card → results → methods → home,
 *  pausing on any touch, click, key or scroll and resuming after 60 s without interaction. */
const ALL_STEPS: { url: string; s: number; label: string; online?: boolean }[] = [
  { url: "/", s: 18, label: "Home" },
  { url: "/map?date=2026-02-01&hour=00&fl=360&m=STRATUM", s: 16, label: "Map: STRATUM, busiest alert day" },
  { url: "/map?date=2026-02-01&fl=360&m=STRATUM&seg=top", s: 22, label: "Top avoidance alert and its card" },
  { url: "/map?date=2026-02-01&hour=00&fl=360&m=B1", s: 12, label: "Same day, uncorrected physics" },
  { url: "/3d?date=2026-02-01&hour=20&layer=B1", s: 16, label: "The humid layer in 3D" },
  { url: "/now", s: 22, label: "Live advice: which planes should move now", online: true },
  { url: "/results", s: 24, label: "Results: H1–H4" },
  { url: "/methods#threats", s: 16, label: "Threats to validity" },
];
// the booth laptop may be offline (expo build): skip the pages that need live data
const STEPS = ALL_STEPS.filter((x) => !x.online || typeof navigator === "undefined" || navigator.onLine);
const IDLE_MS = 60_000;

export function boothRequested(): boolean {
  try {
    if (new URLSearchParams(location.search).get("booth") === "1") sessionStorage.setItem("stratum-booth", "1");
    return sessionStorage.getItem("stratum-booth") === "1";
  } catch {
    return false;
  }
}

export function Booth() {
  const { route } = useLocation();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const idle = useRef<number | undefined>(undefined);

  // pause on any interaction; resume after 60 s idle
  useEffect(() => {
    const touch = () => {
      setPaused(true);
      clearTimeout(idle.current);
      idle.current = window.setTimeout(() => setPaused(false), IDLE_MS);
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => addEventListener(e, touch, { passive: true }));
    return () => evs.forEach((e) => removeEventListener(e, touch));
  }, []);

  useEffect(() => {
    if (paused) return;
    route(STEPS[i].url);
    const t = setTimeout(() => setI((i + 1) % STEPS.length), STEPS[i].s * 1000);
    return () => clearTimeout(t);
  }, [i, paused]);

  return (
    <div class="booth-chip mono-s" role="status">
      {paused ? T("Tour paused — it resumes after a minute without touching") : `${T("Tour")} ${i + 1}/${STEPS.length}: ${T(STEPS[i].label)}`}
    </div>
  );
}
