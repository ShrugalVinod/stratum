// The Schmidt–Appleman criterion in the browser, for the physics sandbox (/sandbox). A direct port
// of stratum/physics (thermo.py, sac.py): Murphy & Koop (2005) saturation over liquid water and
// over ice, the mixing-line slope G (Schumann 1996) with the pre-registered constants, the
// threshold T_LM where the mixing line touches the water curve, and the critical temperature
// T_LC for the ambient humidity. A contrail forms when T ≤ T_LC and lasts when also RHi ≥ 1.
// tests/sac.test.ts checks it against the Python results.

const EI_H2O = 1.23; // kg/kg, kerosene
const C_P = 1004.0; // J kg⁻¹ K⁻¹
const EPSILON = 0.622;
const Q_FUEL = 43.2e6; // J/kg
export const PERSIST_RHI = 1.0;
const T_LC_LOWER = 150;

/** Saturation vapour pressure over (supercooled) liquid water, Pa (Murphy & Koop eq. 10). */
export function eWater(T: number): number {
  const lnT = Math.log(T);
  const b = 53.878 - 1331.22 / T - 9.44523 * lnT + 0.014025 * T;
  return Math.exp(54.842763 - 6763.22 / T - 4.21 * lnT + 0.000367 * T + Math.tanh(0.0415 * (T - 218.8)) * b);
}
/** Saturation vapour pressure over ice, Pa (Murphy & Koop eq. 7). */
export function eIce(T: number): number {
  return Math.exp(9.550426 - 5723.265 / T + 3.53068 * Math.log(T) - 0.00728332 * T);
}
/** de_w/dT, Pa/K (analytic). */
function deWater(T: number): number {
  const lnT = Math.log(T);
  const th = Math.tanh(0.0415 * (T - 218.8));
  const b = 53.878 - 1331.22 / T - 9.44523 * lnT + 0.014025 * T;
  const db = 1331.22 / T ** 2 - 9.44523 / T + 0.014025;
  return eWater(T) * (6763.22 / T ** 2 - 4.21 / T + 0.000367 + 0.0415 * (1 - th ** 2) * b + th * db);
}
/** Root of f on [lo, hi] (f changes sign), by bisection: plenty for a slider. */
function root(f: (x: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.sign(fm) === Math.sign(flo)) [lo, flo] = [mid, fm];
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export const mixingSlope = (pPa: number, eta: number) => (EI_H2O * C_P * pPa) / (EPSILON * Q_FUEL * (1 - eta));
export const tLM = (G: number) => root((T) => Math.log(deWater(T)) - Math.log(G), 180, 260);
export function tLC(TLM: number, rhw: number, G: number): number {
  if (rhw >= 1) return TLM;
  const u = Math.max(0, rhw);
  const ewTm = eWater(TLM);
  return root((T) => ewTm - G * (TLM - T) - u * eWater(T), T_LC_LOWER, TLM);
}

export type Sac = { G: number; TLM: number; TLC: number; rhw: number; forms: boolean; persists: boolean; e: number };
/** T in K, rhi as a fraction, p in Pa, eta = overall propulsion efficiency. */
export function sac(T: number, rhi: number, p: number, eta: number): Sac {
  const G = mixingSlope(p, eta);
  const TLM = tLM(G);
  const rhw = (rhi * eIce(T)) / eWater(T);
  const TLC = tLC(TLM, rhw, G);
  const forms = T <= TLC;
  return { G, TLM, TLC, rhw, forms, persists: forms && rhi >= PERSIST_RHI, e: rhi * eIce(T) };
}

/** ISA pressure (Pa) at a flight level (troposphere below 11 km, isothermal above). */
export function isaPressure(fl: number): number {
  const h = fl * 100 * 0.3048;
  if (h <= 11_000) return 101_325 * (1 - 2.25577e-5 * h) ** 5.25588;
  return 22_632.06 * Math.exp(-(h - 11_000) / 6341.62);
}
