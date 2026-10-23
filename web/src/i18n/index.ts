// English / Hindi for the website. English is the source text; Hindi comes from the dictionary in
// hi.ts, keyed by the English string, so anything not yet translated simply stays English.
//
//   T("Map")                      → "मानचित्र" in Hindi, "Map" in English
//   useLang()                     → re-renders a component when the language changes
//   setLang("hi")                 → remembered (localStorage "stratum-lang"); ?lang=hi also works
//
// The Hindi text was drafted with AI (Claude) and is reviewed by the team (see About the data).
import { useEffect, useState } from "preact/hooks";
import { HI } from "./hi";

export type Lang = "en" | "hi";
const KEY = "stratum-lang";

function initial(): Lang {
  if (typeof location !== "undefined") {
    const q = new URLSearchParams(location.search).get("lang");
    if (q === "hi" || q === "en") return q;
  }
  try {
    return localStorage.getItem(KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

let current: Lang = initial();
let fonts: Promise<unknown> | null = null;
const subs = new Set<(l: Lang) => void>();

function apply(l: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = l === "hi" ? "hi" : "en";
  if (l === "hi") loadFonts();
}
/** Devanagari faces only for Hindi readers (Hind for text, Teko for display; OFL). */
function loadFonts() {
  fonts ??= Promise.all([
    import("@fontsource/hind/devanagari-400.css"),
    import("@fontsource/hind/devanagari-600.css"),
    import("@fontsource/teko/devanagari-500.css"),
    import("@fontsource/teko/devanagari-600.css"),
  ]).catch(() => undefined);
}

apply(current);

export const getLang = () => current;

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  apply(l);
  subs.forEach((f) => f(l));
}

export function useLang(): Lang {
  const [l, set] = useState(current);
  useEffect(() => {
    subs.add(set);
    if (l !== current) set(current);
    return () => void subs.delete(set);
  }, []);
  return l;
}

/** The Hindi for an English string, or the English itself. */
export function T(en: string): string {
  return current === "hi" ? (HI[en] ?? en) : en;
}

/** An inline pair, for text with links or numbers inside: tx("Open the map", "मानचित्र खोलें"). */
export function tx<V>(en: V, hi: V): V {
  return current === "hi" ? hi : en;
}
