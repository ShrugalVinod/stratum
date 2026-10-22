import { useLocation } from "preact-iso";
import { useEffect, useRef, useState } from "preact/hooks";
import { currentTheme, setTheme, type Theme } from "./motion";

const NAV = [
  ["/", "Home", "Move the plane. Lose the cloud."],
  ["/map", "Map", "Contrails, flights and the satellite proof"],
  ["/live", "Live sky", "Which plane made that contrail?"],
  ["/advisory", "Advisories", "Tomorrow's contrail notices"],
  ["/results", "Results", "H1–H4 and what we found"],
  ["/how-it-works", "How it works", "From a ping to a decision"],
  ["/methods", "Methods", "Written down before results"],
  ["/progress", "Progress", "The lab diary"],
  ["/team", "Team", "Who we are"],
  ["/about-data", "Data & code", "Sources, licences, how to reproduce"],
  ["/contact", "Contact", "Get in touch"],
] as const;

const isOn = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Site header: wordmark, the current page, theme switch and a menu button that slides the
 *  navigation in from the side (all screen sizes). Esc, a click outside or a link closes it. */
export function Header() {
  const { path } = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setT] = useState<Theme>("light");
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const here = NAV.find(([href]) => isOn(path, href));

  useEffect(() => setT(currentTheme()), []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
      if (e.key === "Tab" && panel.current) {
        // keep keyboard focus inside the open panel
        const f = [...panel.current.querySelectorAll<HTMLElement>("a, button")];
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setT(next);
    setTheme(next);
  };

  // the panel lives next to the header, not inside it: the header's backdrop blur would make it
  // the containing block of a fixed element and clip the panel to the header's height
  return (
    <>
      <header class="site-header">
        <span class="route-bar" key={path} aria-hidden="true" />
        <div class="wrap header-row">
          <a href="/" class="wordmark" aria-label="STRATUM home">
            <b>STRATUM</b>
            <span class="mono-s">FL360–FL380 · ISSR</span>
          </a>
          {here && here[0] !== "/" && (
            <span class="here mono-s" key={path}>
              § {here[1]}
            </span>
          )}
          <div class="header-tools">
            <button class="theme-btn" onClick={toggle} aria-label={`${theme === "dark" ? "Night" : "Chart"} mode — switch to ${theme === "dark" ? "chart (light)" : "night (dark)"}`}>
              <span class="sq" aria-hidden="true" />
              <span class="word" key={theme}>
                {theme === "dark" ? "Night" : "Chart"}
              </span>
            </button>
            <button ref={btn} class="menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="side-nav">
              <span class="menu-word">{open ? "Close" : "Menu"}</span>
              <span class="menu-icon" aria-hidden="true">
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
        <span class="scroll-meter" aria-hidden="true" />
      </header>
      {/* a fixed, clipping layer: the closed panel waits off-screen without widening the page */}
      <div class="nav-layer">
        <div class={`nav-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
        <nav ref={panel} id="side-nav" class={`side-nav ${open ? "open" : ""}`} aria-label="Main" aria-hidden={!open} inert={!open}>
          <p class="label red side-nav-label">Navigate</p>
          <ul>
            {NAV.map(([href, label, sub], i) => {
              const on = isOn(path, href);
              return (
                <li style={{ "--i": i }}>
                  <a href={href} class={on ? "active" : ""} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)}>
                    <span class="nav-n mono-s">{String(i + 1).padStart(2, "0")}</span>
                    <span class="nav-t">{label}</span>
                    <span class="nav-sub">{sub}</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <p class="mono-s muted side-nav-foot">Conrad Challenge 2026–27 · Indus International School, Bengaluru</p>
        </nav>
      </div>
    </>
  );
}
