import { describe, expect, it } from "vitest";
import { perAlert, rupees, year } from "../src/lib/business";

// the D-006 decisions as published in data/weighted/summary.json
const DEC = {
  days: 12,
  alerts: 666,
  alerts_extra_fuel_kg: 52387.24713922219,
  alerts_net_warming_avoided_h100_p50_kgCO2e: 8639790.413539596,
  alerts_net_warming_avoided_h100_p05_kgCO2e: 4131355.774375389,
  alerts_net_warming_avoided_h20_p50_kgCO2e: 32262132.535972096,
};

describe("what avoiding contrails costs", () => {
  it("per alert: ~79 kg of fuel for ~13 t CO₂e avoided", () => {
    const p = perAlert(DEC);
    expect(p.fuelKg).toBeCloseTo(78.66, 1);
    expect(p.avoidedKg / 1000).toBeCloseTo(12.97, 1);
    expect(p.perDay).toBeCloseTo(55.5, 1);
  });
  it("a year for all of India at ₹137/L, €85/t, ₹106.56/€", () => {
    const y = year(perAlert(DEC), { alertsPerDay: 55.5, atfRsPerL: 137, eurPerT: 85, inrPerEur: 106.56 });
    expect(y.alerts).toBeCloseTo(20257.5, 0);
    expect(y.fuelCostRs / 1e7).toBeCloseTo(27.3, 0); // ₹27 crore
    expect(y.rsPerTonne).toBeCloseTo((78.66 / 0.8) * 137 / 12.97, -1); // fuel ₹ per tonne avoided
    expect(y.carbonRsPerT).toBeCloseTo(9057.6, 0);
    // doubling the fuel price doubles the cost per tonne
    const y2 = year(perAlert(DEC), { alertsPerDay: 55.5, atfRsPerL: 274, eurPerT: 85, inrPerEur: 106.56 });
    expect(y2.rsPerTonne / y.rsPerTonne).toBeCloseTo(2, 6);
  });
  it("writes rupees in lakh and crore", () => {
    expect(rupees(950)).toBe("₹950");
    expect(rupees(250_000)).toBe("₹2.5 lakh");
    expect(rupees(273_000_000)).toBe("₹27.3 crore");
  });
});
