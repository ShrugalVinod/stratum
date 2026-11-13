import { PageHead } from "../components/PageHead";
import { references, updated } from "../content/judges";

/** /references — the same list as the Innovation Brief's reference attachment. */
export function References() {
  return (
    <div class="page">
      <PageHead
        label="References"
        note={`Updated ${updated}`}
        lines={["Our sources."]}
        lede="Every paper, dataset, rule and tool this site, our Innovation Brief and our video rely on. The list is the same in all three."
      />
      <div class="wrap">
        <ol class="j-refs rv rv-fade">
          {references.map((r) => (
            <li>
              {r.ref}{" "}
              {r.href && (
                <a href={r.href} target="_blank" rel="noopener">
                  {r.href.replace(/^https?:\/\//, "")}
                </a>
              )}
            </li>
          ))}
        </ol>
        <p class="small muted rv" style={{ "margin-top": "24px" }}>
          Data credits and licences for each dataset: <a href="/about-data">Data &amp; code</a>.
        </p>
      </div>
      <div class="spacer" />
    </div>
  );
}
