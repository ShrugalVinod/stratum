import { useLocation } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import { site } from "../content/site";
import { T } from "../i18n";

// Things to do first, then things to learn, then the research behind it and who we are
const NAV = [
  ["/", "Home", "Move the plane. Lose the cloud."],
  ["/map", "Map", "Contrails, flights and the satellite proof"],
  ["/now", "Live advice", "Which planes should move, right now"],
  ["/flight", "Your flight", "Its hidden contrail footprint"],
  ["/spot", "Spot a contrail", "Your photo → the plane that drew it"],
  ["/replay", "What if we'd listened?", "One real day, replayed both ways"],
  ["/3d", "The sky in 3D", "Watch contrails being born over India"],
  ["/sandbox", "Make a contrail", "The physics, with sliders"],
  ["/report", "Report card", "Was yesterday's forecast right?"],
  ["/how-it-works", "How it works", "From a ping to a decision"],
  ["/airlines", "For airlines", "The rules, where the warming comes from, and the cost"],
  ["/results", "Results", "H1–H4 and what we found"],
  ["/methods", "Methods", "Written down before results"],
  ["/about-data", "Data & code", "Sources, licences, how to reproduce"],
  ["/team", "Team", "Who we are, and how to reach us"],
] as const;
// the menu's three columns (pages left out of the menu still open by link)
const GROUPS: [string, number, number][] = [
  ["Things you can do", 0, 9],
  ["Things to learn", 9, 11],
  ["Research and the rest", 11, 15],
];
// the few links that live in the bar itself on wide screens
const QUICK = ["/map", "/now", "/3d", "/how-it-works", "/results"];

const isOn = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));
const two = (n: number) => String(n).padStart(2, "0");

/** The mark: a plane (red) and its short trail above the humid layer (teal). */
export function Mark() {
  return (
    <svg class="mark" viewBox="0 0 30 20" width="30" height="20" aria-hidden="true">
      <path class="mk-trail" d="M9 4h14" />
      <circle class="mk-plane" cx="26" cy="4" r="2.1" />
      <path class="mk-layer" d="M2 10.5h26" />
      <path class="mk-low" d="M2 16.5h17" />
    </svg>
  );
}

/** Site header: an instrument bar (mark, shortcuts, language, theme, menu) and a full-screen
 *  directory of every page with a filter box. "/" or Ctrl/⌘ K opens it; Esc closes it. */
export function Header() {
  const { path, route } = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [now, setNow] = useState(() => new Date());
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const viaKey = useRef(false);
  const here = NAV.find(([href]) => isOn(path, href));

  useEffect(() => setOpen(false), [path]);

  // "/" or Ctrl/⌘ K: open the directory with the filter box ready
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        viaKey.current = true;
        setOpen(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    document.documentElement.classList.toggle("menu-open", open);
    if (!open) {
      setQ("");
      return;
    }
    // a key press goes to the filter box; a tap goes to the first link (no phone keyboard pops up)
    if (viaKey.current) search.current?.focus({ preventScroll: true });
    else panel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    viaKey.current = false;
    setNow(new Date());
    const clock = setInterval(() => setNow(new Date()), 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
      if (e.key === "Tab" && panel.current) {
        // keep keyboard focus inside the open panel
        const f = [...panel.current.querySelectorAll<HTMLElement>("a, button, input")].filter((x) => x.offsetParent !== null);
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
      }
    };
    addEventListener("keydown", onKey);
    return () => {
      clearInterval(clock);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  const find = () => {
    viaKey.current = true;
    setOpen(true);
  };

  const needle = q.trim().toLowerCase();
  const hit = (i: number) => !needle || [NAV[i][1], NAV[i][2], T(NAV[i][1]), T(NAV[i][2]), NAV[i][0]].some((s) => s.toLowerCase().includes(needle));
  const firstHit = NAV.findIndex((_, i) => hit(i));
  const utc = `${two(now.getUTCHours())}:${two(now.getUTCMinutes())}:${two(now.getUTCSeconds())}`;
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);

  // the header stays above the open directory, so the same button closes it
  return (
    <>
      <header class={`site-header ${open ? "over-menu" : ""}`}>
        <span class="route-bar" key={path} aria-hidden="true" />
        <div class="wrap header-row">
          <a href="/" class="wordmark" aria-label="STRATUM home">
            <Mark />
            <b>STRATUM</b>
          </a>
          <nav class="quick" aria-label="Shortcuts">
            {QUICK.map((href) => {
              const n = NAV.find((x) => x[0] === href)!;
              const on = isOn(path, href);
              return (
                <a href={href} class={on ? "on" : ""} aria-current={on ? "page" : undefined}>
                  {T(n[1])}
                </a>
              );
            })}
          </nav>
          {here && here[0] !== "/" && (
            <span class="here mono-s" key={path}>
              § {T(here[1])}
            </span>
          )}
          <div class="header-tools">
            <button class="find-btn" onClick={find} aria-label="Search pages">
              <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 5 5" />
              </svg>
              <span>{T("Search")}</span>
              <kbd class="mono-s" aria-hidden="true">
                /
              </kbd>
            </button>
            <button ref={btn} class="menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="side-nav">
              <span class="menu-word">{open ? T("Close") : T("Menu")}</span>
              <span class="menu-icon" aria-hidden="true">
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
        <span class="scroll-meter" aria-hidden="true" />
      </header>
      {/* a fixed, clipping layer under the header: the closed directory never widens the page */}
      <div class="nav-layer">
        <nav ref={panel} id="side-nav" class={`side-nav ${open ? "open" : ""}`} aria-label="Main" aria-hidden={!open} inert={!open}>
          <div class="wrap nav-grid">
            <div class="nav-aside">
              <p class="label red side-nav-label">{T("Navigate")}</p>
              <label class="nav-search">
                <span class="sr-only">{"Search pages"}</span>
                <input
                  ref={search}
                  type="search"
                  value={q}
                  placeholder={"Search pages"}
                  autocomplete="off"
                  spellcheck={false}
                  onInput={(e) => setQ((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && firstHit >= 0) {
                      e.preventDefault();
                      setOpen(false);
                      route(NAV[firstHit][0]);
                    }
                  }}
                />
                <kbd class="mono-s" aria-hidden="true">
                  /
                </kbd>
              </label>
              <div class="nav-clock mono" aria-hidden="true">
                <b>{utc}</b> UTC
                <span>
                  {two(ist.getUTCHours())}:{two(ist.getUTCMinutes())} IST · 12.97°N 77.59°E
                </span>
              </div>
              <p class="nav-tag">{T(site.tagline)}</p>
              <p class="mono-s muted side-nav-foot">{T("Conrad Challenge 2026–27 · Indus International School, Bengaluru")}</p>
            </div>
            <div class="nav-groups">
              {GROUPS.map(([title, a, b], g) => (
                <section class={`nav-col nav-col-${g}`} hidden={!NAV.slice(a, b).some((_, k) => hit(a + k))}>
                  <p class="nav-group mono-s" aria-hidden="true">
                    {T(title)}
                  </p>
                  <ul>
                    {NAV.slice(a, b).map(([href, label, sub], k) => {
                      const i = a + k;
                      const on = isOn(path, href);
                      return (
                        <li style={{ "--i": i }} hidden={!hit(i)}>
                          <a href={href} class={on ? "active" : ""} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)}>
                            <span class="nav-n mono-s">{two(i + 1)}</span>
                            <span class="nav-t">{T(label)}</span>
                            <span class="nav-sub">{T(sub)}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {firstHit < 0 && <p class="nav-none muted">{"No page matches. Try “map”, “results” or “team”."}</p>}
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}
