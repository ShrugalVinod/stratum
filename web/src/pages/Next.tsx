import { PageHead } from "../components/PageHead";
import { cantDo, roadmap, satelliteSwitch, updated } from "../content/judges";

/** /next — the roadmap with dates, why we use Meteosat-9, and what STRATUM cannot do yet. */
export function Next() {
  return (
    <div class="page">
      <PageHead
        label="What's next"
        note={`Updated ${updated}`}
        lines={["From a study", "to a trial."]}
        lede="What we have finished, what we will do next and when, and the limits we still have to solve."
      />
      <div class="wrap">
        <section class="section pt0" aria-labelledby="road">
          <div class="sec-head rv">
            <p class="label red" id="road">
              §1 · Roadmap
            </p>
            <span class="mono-s">dates ahead are plans</span>
          </div>
          <ol class="j-road rv">
            {roadmap.map((r) => (
              <li class={r.done ? "done" : ""}>
                <span class="mono-s">{r.when}</span>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section class="section" aria-labelledby="sat">
          <div class="sec-head rv">
            <p class="label red" id="sat">
              §2 · Why Meteosat-9, not INSAT-3D
            </p>
            <span class="mono-s">a change since our Lean Canvas</span>
          </div>
          <p class="lede rv j-prose">{satelliteSwitch}</p>
        </section>

        <section class="section" aria-labelledby="limits">
          <div class="sec-head rv">
            <p class="label red" id="limits">
              §3 · What STRATUM can't do yet
            </p>
            <span class="mono-s">the long list is on Methods</span>
          </div>
          <div class="j-limits rv">
            <ul>
              {cantDo.map((c) => (
                <li>{c}</li>
              ))}
            </ul>
          </div>
          <p class="small muted rv">
            Every limit in detail: <a href="/methods">Methods</a>. The business side: <a href="/business">Business plan</a>.
          </p>
        </section>
      </div>
      <div class="spacer" />
    </div>
  );
}
