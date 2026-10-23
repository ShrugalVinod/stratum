import { useEffect, useRef, useState } from "preact/hooks";
import { PageHead } from "../components/PageHead";
import type { GameIndex, GameRound } from "../data/contract";
import { gameImg, loadGame } from "../data/load";
import { T, tx } from "../i18n";
import "../styles/map.css";

/** /game — "Beat STRATUM", for the booth: ten held-out flights, the weather at each aircraft,
 *  one question (did the satellite see a lasting contrail?). The player answers, then the
 *  Meteosat picture is shown with STRATUM's and the physics' answers. Rounds and their
 *  disclosure come from data/game/index.json (stratum/export/game.py). */

const N = 10;
type Answer = { round: GameRound; you: boolean };

const pts = (xy: number[][]) => xy.map(([x, y]) => `${x + 0.5},${y + 0.5}`).join(" ");
const pct = (v: number | null, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)} %`);

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** A fair deal: half seen, half not, in random order. */
function deal(rounds: GameRound[]): GameRound[] {
  const seen = shuffle(rounds.filter((r) => r.seen));
  const not = shuffle(rounds.filter((r) => !r.seen));
  const k = Math.min(N / 2, seen.length, not.length);
  return shuffle([...seen.slice(0, k), ...not.slice(0, k)]);
}

export function Game() {
  const [g, setG] = useState<GameIndex | null | undefined>(undefined);
  const [hand, setHand] = useState<GameRound[]>([]);
  const [i, setI] = useState(-1); // -1: intro
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    loadGame().then(setG);
  }, []);

  const start = () => {
    if (!g) return;
    setHand(deal(g.rounds));
    setAnswers([]);
    setShown(false);
    setI(0);
  };
  const r = i >= 0 && i < hand.length ? hand[i] : null;
  const answer = (you: boolean) => {
    if (!r || shown) return;
    setAnswers([...answers, { round: r, you }]);
    setShown(true);
  };
  const next = () => {
    setShown(false);
    setI(i + 1);
  };

  // one listener for the page's lifetime that always calls the latest handler, so a key pressed
  // the instant a round appears is never lost between renders
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e: KeyboardEvent) => {
    if (!r) return;
    if (!shown && (e.key === "y" || e.key === "ArrowLeft")) answer(true);
    else if (!shown && (e.key === "n" || e.key === "ArrowRight")) answer(false);
    else if (shown && (e.key === "Enter" || e.key === " ")) (e.preventDefault(), next());
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => onKey.current(e);
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, []);

  const score = (who: (a: Answer) => boolean) => answers.filter((a) => who(a) === a.round.seen).length;
  const you = score((a) => a.you);
  const st = score((a) => a.round.stratum_says);
  const ph = score((a) => a.round.physics_says);
  const done = i >= hand.length && hand.length > 0;

  return (
    <div class="page game">
      <PageHead
        label="Game · for the booth"
        note={g ? tx(`${g.rounds.length} held-out flights · Meteosat-9`, `${g.rounds.length} अलग रखी गई उड़ानें · Meteosat-9`) : g === null ? "Rounds not published yet" : "Loading…"}
        lines={["Beat STRATUM."]}
        lede="You get the weather at a real aircraft, at the moment it flew. Did the satellite see it leave a lasting contrail? STRATUM and the physics answer too. Ten flights."
      />
      <div class="wrap">
        {g === null && <p class="muted mono">{T("The game rounds are not published yet.")}</p>}

        {g && i === -1 && (
          <div class="gm-intro rv">
            <ol class="gm-rules">
              <li>{T("Read the weather card: humidity relative to ice, temperature, cloud.")}</li>
              <li>{T("Answer: contrail seen, or not? (keys: Y / N)")}</li>
              <li>{T("See the satellite picture, and what STRATUM and the physics said.")}</li>
            </ol>
            <button class="gm-big" onClick={start}>
              {T("Start")}
            </button>
          </div>
        )}

        {r && (
          <div class="gm-round">
            <div class="gm-top mono-s">
              <span>
                {tx(`Flight ${i + 1} of ${hand.length}`, `उड़ान ${i + 1} / ${hand.length}`)}
              </span>
              <span>
                {T("You")} {you} · STRATUM {st} · {T("Physics")} {ph}
              </span>
            </div>
            <div class="gm-grid">
              <Weather r={r} />
              <div class="gm-right">
                {!shown ? (
                  <div class="gm-ask">
                    <p class="gm-q">{T("Did the satellite see a lasting contrail behind this aircraft?")}</p>
                    <div class="gm-buttons">
                      <button class="gm-big yes" onClick={() => answer(true)}>
                        {T("Yes, contrail")}
                      </button>
                      <button class="gm-big no" onClick={() => answer(false)}>
                        {T("No contrail")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <Reveal r={r} you={answers[answers.length - 1].you} credit={g?.credit ?? ""} onNext={next} last={i === hand.length - 1} />
                )}
              </div>
            </div>
          </div>
        )}

        {done && (
          <div class="gm-end rv">
            <p class="label red">{T("Final score")}</p>
            <div class="gm-scores">
              {(
                [
                  ["You", you],
                  ["STRATUM", st],
                  ["Physics", ph],
                ] as const
              ).map(([who, n]) => (
                <div class={who === "You" ? "me" : ""}>
                  <b>{n}</b>
                  <span>/ {hand.length}</span>
                  <p class="mono-s">{T(who)}</p>
                </div>
              ))}
            </div>
            <p class="lede">
              {T(you > st ? "You beat STRATUM. Our model would like a word." : you === st ? "A draw with STRATUM." : "STRATUM wins this time.")}{" "}
              {ph < st ? T("Pure physics did worst: it expects contrails wherever the air is humid enough, and the satellite often disagrees.") : ""}
            </p>
            <button class="gm-big" onClick={start}>
              {T("Play again")}
            </button>
            <p class="small muted gm-note">{g?.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Weather({ r }: { r: GameRound }) {
  const w = r.wx;
  const tc = w.temp_k == null ? null : w.temp_k - 273.15;
  const night = r.lst_h != null && (r.lst_h >= 18 || r.lst_h < 6);
  const rhiBar = (v: number | null, label: string) => (
    <div class="gm-rhi">
      <span class="mono-s">{T(label)}</span>
      <span class="gm-bar">
        <i style={{ width: `${Math.min(100, ((v ?? 0) / 1.4) * 100)}%` }} class={(v ?? 0) >= 1 ? "wet" : ""} />
        <em style={{ left: `${(1 / 1.4) * 100}%` }} title={T("100 %: ice-saturated")} />
      </span>
      <span class="mono">{pct(v)}</span>
    </div>
  );
  return (
    <div class="gm-card">
      <p class="label">{T("The air at the aircraft")}</p>
      <p class="gm-where mono-s muted">
        FL{r.fl} · {r.t.slice(0, 10)} {r.t.slice(11, 16)} UTC · {T(night ? "night" : "day")}
        {r.aircraft_type ? ` · ${r.aircraft_type}` : ""}
      </p>
      <p class="gm-sub">{T("Humidity relative to ice (a lasting contrail needs 100 % or more)")}</p>
      {rhiBar(w.rhi_above, "level above")}
      {rhiBar(w.rhi, "at the aircraft")}
      {rhiBar(w.rhi_below, "level below")}
      <dl class="gm-facts">
        <div>
          <dt>{T("Temperature")}</dt>
          <dd>{tc == null ? "—" : `${tc.toFixed(0)} °C`}</dd>
        </div>
        <div>
          <dt>{T("Cold enough to form one?")}</dt>
          <dd>
            {w.sac_margin_k == null
              ? "—"
              : w.sac_margin_k <= 0
                ? tx(`Yes, ${Math.abs(w.sac_margin_k).toFixed(0)} °C below the limit`, `हाँ, सीमा से ${Math.abs(w.sac_margin_k).toFixed(0)} °C नीचे`)
                : tx(`No, ${w.sac_margin_k.toFixed(0)} °C too warm`, `नहीं, ${w.sac_margin_k.toFixed(0)} °C ज़्यादा गर्म`)}
          </dd>
        </div>
        <div>
          <dt>{T("Natural cirrus")}</dt>
          <dd>{w.cloud_ice == null ? "—" : T(w.cloud_ice > 1e-6 ? "Some ice cloud here" : "Clear")}</dd>
        </div>
        <div>
          <dt>{T("High cloud cover")}</dt>
          <dd>{pct(w.high_cloud)}</dd>
        </div>
      </dl>
      <p class="mono-s muted">{T("ERA5 reanalysis at the aircraft's position and time.")}</p>
    </div>
  );
}

function Reveal({ r, you, credit, onNext, last }: { r: GameRound; you: boolean; credit: string; onNext: () => void; last: boolean }) {
  const s = r.slot;
  const right = you === r.seen;
  return (
    <div class="gm-reveal">
      <p class={`gm-verdict ${right ? "ok" : "miss"}`}>{T(right ? "Right!" : "Not this time.")}</p>
      <p>
        {tx(
          <>
            The satellite <b>{r.seen ? "did see" : "did not see"}</b> a lasting contrail.
          </>,
          <>
            उपग्रह ने टिकाऊ कंट्रेल <b>{r.seen ? "देखी" : "नहीं देखी"}</b>।
          </>,
        )}
      </p>
      <figure class="gm-sat">
        <div class="proof-img" style={{ aspectRatio: `${s.w} / ${s.h}` }}>
          <img src={gameImg(s.img)} width={s.w} height={s.h} alt={tx(`Meteosat-9 at ${s.t.slice(11, 16)} UTC around the flight`, `${s.t.slice(11, 16)} UTC पर उड़ान के आसपास Meteosat-9`)} />
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
        <figcaption class="mono-s muted">
          {s.t.slice(11, 16)} UTC, ≈ {Math.round(s.age_min)} {T("min after the flight")} ·{" "}
          {T("dashed white: the flight · cyan: where its contrail should be by now · orange: the line our detector found there")}
        </figcaption>
      </figure>
      <ul class="gm-answers">
        <li class={you === r.seen ? "ok" : "miss"}>
          {T("You said")} <b>{T(you ? "yes" : "no")}</b>
        </li>
        <li class={r.stratum_says === r.seen ? "ok" : "miss"}>
          {T("STRATUM said")} <b>{T(r.stratum_says ? "yes" : "no")}</b> <span class="mono-s">({pct(r.stratum_p, 1)})</span>
        </li>
        <li class={r.physics_says === r.seen ? "ok" : "miss"}>
          {T("Physics said")} <b>{T(r.physics_says ? "yes" : "no")}</b>
        </li>
      </ul>
      <button class="gm-big" onClick={onNext} autoFocus>
        {T(last ? "See the score" : "Next flight →")}
      </button>
      <p class="mono-s muted">{credit}</p>
    </div>
  );
}
