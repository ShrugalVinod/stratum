import { useLocation } from "preact-iso";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { currentTheme, setTheme, type Theme } from "./motion";

const NAV = [
  ["/map", "Map"],
  ["/how-it-works", "How it works"],
  ["/progress", "Progress"],
  ["/results", "Results"],
  ["/methods", "Methods"],
  ["/team", "Team"],
  ["/about-data", "Data & code"],
  ["/contact", "Contact"],
] as const;

export function Header() {
  const { path } = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setT] = useState<Theme>("light");
  const nav = useRef<HTMLElement>(null);
  const ind = useRef<HTMLSpanElement>(null);

  useEffect(() => setT(currentTheme()), []);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  // the red outline glides to the active page
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelector<HTMLElement>("a.active");
      const i = ind.current;
      if (!i) return;
      if (!a) return void (i.style.opacity = "0");
      i.style.opacity = "1";
      i.style.width = `${a.offsetWidth}px`;
      i.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    place();
    document.fonts?.ready.then(place);
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [path]);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setT(next);
    setTheme(next);
  };

  return (
    <header class="site-header">
      <span class="route-bar" key={path} aria-hidden="true" />
      <div class="wrap header-row">
        <a href="/" class="wordmark" aria-label="STRATUM home">
          <b>STRATUM</b>
          <span class="mono-s">FL360–FL380 · ISSR</span>
        </a>
        <nav ref={nav} class={`nav ${open ? "open" : ""}`} aria-label="Main">
          <span ref={ind} class="nav-ind" aria-hidden="true" />
          {NAV.map(([href, label], i) => {
            const on = path.startsWith(href);
            return (
              <a href={href} class={on ? "active" : ""} aria-current={on ? "page" : undefined} style={{ "--i": i }}>
                {label}
              </a>
            );
          })}
        </nav>
        <div class="header-tools">
          <button class="theme-btn" onClick={toggle} aria-label={`${theme === "dark" ? "Night" : "Chart"} mode — switch to ${theme === "dark" ? "chart (light)" : "night (dark)"}`}>
            <span class="sq" aria-hidden="true" />
            <span class="word" key={theme}>
              {theme === "dark" ? "Night" : "Chart"}
            </span>
          </button>
          <button class="menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
            <i />
            <i />
          </button>
        </div>
      </div>
      <span class="scroll-meter" aria-hidden="true" />
    </header>
  );
}
