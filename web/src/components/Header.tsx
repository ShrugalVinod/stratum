import { useLocation } from "preact-iso";
import { useEffect, useState } from "preact/hooks";

const NAV = [
  ["/map", "Map"],
  ["/how-it-works", "How it works"],
  ["/progress", "Progress"],
  ["/methods", "Methods"],
  ["/team", "Team"],
  ["/about-data", "About the data"],
  ["/contact", "Contact"],
] as const;

function currentTheme(): "dark" | "light" {
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function Wordmark() {
  return (
    <a href="/" class="wordmark" aria-label="STRATUM home">
      <span>STRATUM</span>
      <svg viewBox="0 0 40 6" aria-hidden="true">
        <path d="M2 5 Q20 1 38 0.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </a>
  );
}

export function Header() {
  const { path } = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => setTheme(currentTheme()), []);
  useEffect(() => setOpen(false), [path]);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("stratum-theme", next);
    } catch {
      /* private mode: theme is not remembered */
    }
    setTheme(next);
  };

  return (
    <header class="site-header">
      <div class="wrap header-row">
        <Wordmark />
        <nav class={`nav ${open ? "open" : ""}`} aria-label="Main">
          {NAV.map(([href, label]) => (
            <a href={href} class={path.startsWith(href) ? "active" : ""} aria-current={path.startsWith(href) ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div class="header-tools">
          <button class="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button class="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
