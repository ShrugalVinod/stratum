// The site is in English. (A Hindi edition existed from 23 Oct to 10 Nov 2026 and was retired
// with the night-sky redesign.) T() remains as the one place every piece of page text passes
// through, so a second language could be added again without touching the pages.
export type Lang = "en";
export const getLang = (): Lang => "en";
export const useLang = (): Lang => "en";

/** The text to show for an English source string. */
export function T(en: string): string {
  return en;
}
