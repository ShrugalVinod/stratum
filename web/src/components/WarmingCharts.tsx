import { T, tx } from "../i18n";

/** Contrail warming broken down by group (airline, hour, level…): each bar is the group's share of
 *  the modelled warming, the tick its share of the distance flown. Used by /routes and /airlines.
 *  Data: data/dashboard/summary.json (stratum/export/dashboard.py). */

export type Row = { key: string; flights: number; km: number; flights_warming: number; share_km: number; share_warm_b1: number; share_warm_w: number; index_w: number | null };
export type Metric = "share_warm_w" | "share_warm_b1";

export const pc = (v: number, d = 1) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 2 : d)} %`;

export function Bars({ rows, metric, label, short }: { rows: Row[]; metric: Metric; label: (r: Row) => string; short?: (r: Row) => string }) {
  const max = Math.max(0.0001, ...rows.map((r) => Math.max(r[metric], r.share_km)));
  return (
    <ul class="rt-bars">
      {rows.map((r) => (
        <li title={tx(`${label(r)}: ${pc(r[metric])} of the warming, ${pc(r.share_km)} of the distance · ${r.flights.toLocaleString()} flights`, `${label(r)}: गर्मी का ${pc(r[metric])}, दूरी का ${pc(r.share_km)} · ${r.flights.toLocaleString()} उड़ानें`)}>
          <span class="rt-l">
            <span class={short ? "rt-full" : ""}>{label(r)}</span>
            {short && <span class="rt-short">{short(r)}</span>}
          </span>
          <span class="rt-track">
            <i class="rt-bar" style={{ width: `${(r[metric] / max) * 100}%` }} />
            <em class="rt-tick" style={{ left: `${(r.share_km / max) * 100}%` }} />
          </span>
          <span class="rt-v mono-s">
            <b>{pc(r[metric])}</b> · {pc(r.share_km)} {tx("km", "किमी")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Hours({ rows, metric }: { rows: Row[]; metric: Metric }) {
  const by = new Map(rows.map((r) => [r.key, r]));
  const hs = Array.from({ length: 24 }, (_, h) => by.get(String(h).padStart(2, "0")));
  const max = Math.max(0.0001, ...hs.map((r) => (r ? Math.max(r[metric], r.share_km) : 0)));
  const W = 1200;
  const H = 200;
  const bw = W / 24;
  return (
    <svg class="rt-hours" viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={T("Share of contrail warming and of distance by hour of day, IST")}>
      <rect class="rt-night" x={0} y={0} width={bw * 6} height={H} />
      <rect class="rt-night" x={bw * 18} y={0} width={bw * 6} height={H} />
      {hs.map((r, h) => {
        if (!r) return null;
        const bh = (r[metric] / max) * (H - 8);
        const th = H - (r.share_km / max) * (H - 8);
        return (
          <g>
            <title>{tx(`${String(h).padStart(2, "0")}:00 IST: ${pc(r[metric])} of the warming, ${pc(r.share_km)} of the distance`, `${String(h).padStart(2, "0")}:00 IST: गर्मी का ${pc(r[metric])}, दूरी का ${pc(r.share_km)}`)}</title>
            <rect class="rt-bar" x={h * bw + 3} y={H - bh} width={bw - 6} height={Math.max(bh, 0.5)} rx={2} />
            <line class="rt-tick-l" x1={h * bw + 1} x2={(h + 1) * bw - 1} y1={th} y2={th} />
            <rect x={h * bw} y={0} width={bw} height={H} fill="transparent" />
          </g>
        );
      })}
      <line class="rt-axis" x1={0} x2={W} y1={H} y2={H} />
      {[0, 6, 12, 18].map((h) => (
        <text class="rt-ax" x={h * bw + 2} y={H + 16}>
          {String(h).padStart(2, "0")}:00
        </text>
      ))}
      <text class="rt-ax" x={4} y={14}>
        {T("night")}
      </text>
      <text class="rt-ax" x={bw * 18 + 4} y={14}>
        {T("night")}
      </text>
    </svg>
  );
}
