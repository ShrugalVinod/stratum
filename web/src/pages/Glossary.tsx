import { PageHead } from "../components/PageHead";
import { glossary } from "../content/judges";

/** /glossary — the terms a non-scientist meets on this site, in plain words. */
export function Glossary() {
  return (
    <div class="page">
      <PageHead
        label="Glossary"
        note={`${glossary.length} terms`}
        lines={["The words,", "in plain English."]}
        lede="The science words on this site, explained for someone who has never studied the atmosphere."
      />
      <div class="wrap">
        <dl class="j-gloss rv rv-fade">
          {glossary.map(([t, d]) => (
            <>
              <dt id={t.split(" ")[0].toLowerCase()}>{t}</dt>
              <dd>{d}</dd>
            </>
          ))}
        </dl>
      </div>
      <div class="spacer" />
    </div>
  );
}
