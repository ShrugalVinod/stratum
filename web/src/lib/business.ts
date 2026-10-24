// What avoiding contrails would cost an airline, in rupees (/airlines calculator).
//
// Per alert (one flight stretch where STRATUM advises another level), from our decision layer
// redone with STRATUM's probabilities (second analysis D-006, data/weighted/summary.json): the
// extra fuel of the alerts and the net warming they avoid (CO₂e, 100 years, median and the
// cautious 5th percentile; 20 years for comparison), divided by the number of alerts. Everything
// else is an input the reader can change: how many alerts a day, the jet-fuel price, the carbon
// price and the exchange rate. Descriptive, like D-006 itself.

export const ATF_KG_PER_L = 0.8; // typical Jet A-1 density (0.775–0.840 kg/L)
export const CO2_PER_KG_FUEL = 3.16; // kg CO₂ per kg kerosene (preregistered.yaml)

export type Decisions = {
  days: number;
  alerts: number;
  alerts_extra_fuel_kg: number;
  alerts_net_warming_avoided_h100_p50_kgCO2e: number;
  alerts_net_warming_avoided_h100_p05_kgCO2e: number;
  alerts_net_warming_avoided_h20_p50_kgCO2e: number;
};

export type PerAlert = { fuelKg: number; avoidedKg: number; cautiousKg: number; avoided20Kg: number; perDay: number };
export function perAlert(d: Decisions): PerAlert {
  const n = Math.max(1, d.alerts);
  return {
    fuelKg: d.alerts_extra_fuel_kg / n,
    avoidedKg: d.alerts_net_warming_avoided_h100_p50_kgCO2e / n,
    cautiousKg: d.alerts_net_warming_avoided_h100_p05_kgCO2e / n,
    avoided20Kg: d.alerts_net_warming_avoided_h20_p50_kgCO2e / n,
    perDay: d.alerts / Math.max(1, d.days),
  };
}

export type Inputs = { alertsPerDay: number; atfRsPerL: number; eurPerT: number; inrPerEur: number };
export type Year = {
  alerts: number;
  fuelT: number;
  fuelCostRs: number;
  avoidedT: number; // net warming avoided, CO₂e, 100 years, median
  cautiousT: number; // the same, 5th percentile
  valueRs: number; // avoided warming at the carbon price
  rsPerTonne: number; // fuel cost per tonne of CO₂e avoided
  carbonRsPerT: number;
};
export function year(p: PerAlert, i: Inputs): Year {
  const alerts = i.alertsPerDay * 365;
  const fuelKg = alerts * p.fuelKg;
  const fuelCostRs = (fuelKg / ATF_KG_PER_L) * i.atfRsPerL;
  const avoidedT = (alerts * p.avoidedKg) / 1000;
  const carbonRsPerT = i.eurPerT * i.inrPerEur;
  return {
    alerts,
    fuelT: fuelKg / 1000,
    fuelCostRs,
    avoidedT,
    cautiousT: (alerts * p.cautiousKg) / 1000,
    valueRs: avoidedT * carbonRsPerT,
    rsPerTonne: avoidedT > 0 ? fuelCostRs / avoidedT : Infinity,
    carbonRsPerT,
  };
}

/** ₹ in the Indian way: lakh and crore for big amounts. */
export function rupees(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 1)} crore`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} lakh`;
  return `${s}₹${Math.round(a).toLocaleString("en-IN")}`;
}
