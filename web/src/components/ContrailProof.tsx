import { useEffect, useRef, useState } from "preact/hooks";
import type { ContrailEvent } from "../data/contract";
import { contrailImg } from "../data/load";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const hhmm = (iso: string) => iso.slice(11, 16);
const pts = (xy: [number, number][]) => xy.map(([x, y]) => `${x + 0.5},${y + 0.5}`).join(" ");

/** The satellite proof for one contrail: the Meteosat crops (ash false colour, north up) with
 *  where the aircraft flew, where the physics says its contrail drifted, and the line the
 *  detector found — one image per satellite time, playable as a time-lapse. */
export function ContrailProof({ ev, day, detector, credit, onClose }: {
  ev: ContrailEvent;
  day: string;
  detector: string;
  credit: string;
  onClose: () => void;
}) {
  const [k, setK] = useState(0);
  const [play, setPlay] = useState(!reduced() && ev.slots.length > 1);
  const box = useRef<HTMLDivElement>(null);
  const s = ev.slots[Math.min(k, ev.slots.length - 1)];

  useEffect(() => {
    if (!play || ev.slots.length < 2) return;
    const t = setInterval(() => setK((i) => (i + 1) % ev.slots.length), 1400);
    return () => clearInterval(t);
  }, [play, ev.slots.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") (setPlay(false), setK((i) => Math.min(i + 1, ev.slots.length - 1)));
      if (e.key === "ArrowLeft") (setPlay(false), setK((i) => Math.max(i - 1, 0)));
    };
    addEventListener("keydown", onKey);
    box.current?.focus();
    return () => removeEventListener("keydown", onKey);
  }, [ev.id]);

  const who = [ev.callsign, ev.airline, ev.aircraft_type].filter(Boolean).join(" · ");
  return (
    <div class="proof-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="proof" role="dialog" aria-modal="true" aria-labelledby="proof-title" tabIndex={-1} ref={box}>
        <div class="proof-head">
          <div>
            <p class="label red">Satellite proof</p>
            <h2 id="proof-title" class="proof-title">
              {who || "A commercial flight"}
            </h2>
            <p class="mono-s muted">
              {ev.fl ? `FL${ev.fl} · ` : ""}flew {hhmm(ev.t_start)}–{hhmm(ev.t_end)} UTC · {ev.segments} min of contrail seen
            </p>
          </div>
          <button class="tool" onClick={onClose} aria-label="Close the satellite proof">
            Close ✕
          </button>
        </div>

        <div class="proof-body">
          <figure class="proof-fig">
            <div class="proof-img" style={{ aspectRatio: `${s.w} / ${s.h}` }}>
              <img src={contrailImg(day, s.img)} width={s.w} height={s.h} alt={`Meteosat-9 at ${hhmm(s.t)} UTC around the contrail`} />
              <svg viewBox={`0 0 ${s.w} ${s.h}`} aria-hidden="true" preserveAspectRatio="none">
                {s.track.map((l) => (
                  <polyline class="pr-track" points={pts(l)} />
                ))}
                {s.drift.map((l) => (
                  <polyline class="pr-drift" points={pts(l)} />
                ))}
                {s.detected.map((d) => (
                  <polyline class={d.matched ? "pr-det matched" : "pr-det"} points={pts(d.pts)} />
                ))}
              </svg>
            </div>
            <figcaption class="mono-s">
              {hhmm(s.t)} UTC · contrail ≈ {Math.round(s.age_min)} min old
              {s.match_px != null ? ` · predicted vs detected: ${s.match_px.toFixed(1)} px apart` : ""}
              {s.vza_deg != null ? ` · viewing angle ${Math.round(s.vza_deg)}°` : ""}
            </figcaption>
          </figure>

          <div class="proof-side">
            <div class="proof-steps" role="group" aria-label="Satellite images">
              {ev.slots.map((x, i) => (
                <button class={i === k ? "on" : ""} aria-pressed={i === k} onClick={() => (setPlay(false), setK(i))}>
                  {hhmm(x.t)}
                  <span>{Math.round(x.age_min)} min</span>
                </button>
              ))}
            </div>
            {ev.slots.length > 1 && (
              <button class="tool" onClick={() => setPlay(!play)}>
                {play ? "❚❚ Pause" : "▶ Play the sequence"}
              </button>
            )}
            <ul class="proof-key">
              <li>
                <i class="k-track" /> Where the aircraft flew
              </li>
              <li>
                <i class="k-drift" /> Where its contrail should be: drifted with the wind (ERA5), corrected for the satellite's viewing angle
              </li>
              <li>
                <i class="k-det" /> The line our detector found ({detector})
              </li>
              <li>
                <i class="k-other" /> Other lines it found nearby
              </li>
            </ul>
            <p class="small muted">
              A flight counts as "seen" only if its predicted contrail lies on a detected line in at least two images (pre-registered rule). These
              labels come from the learned detector, a disclosed second analysis (D-005); the logged results use the original detector. Ash false
              colour: contrails and thin ice cloud look dark blue to black.
            </p>
            <p class="mono-s muted">{credit}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
