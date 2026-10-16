import type { ComponentChildren } from "preact";

export function PageHead(props: { eyebrow: string; title: string; side?: ComponentChildren; id?: string }) {
  return (
    <div class="wrap page-head">
      <div>
        <p class="eyebrow">{props.eyebrow}</p>
        <h1 class="display l" id={props.id}>
          {props.title}
        </h1>
      </div>
      {props.side && <div class="side">{props.side}</div>}
    </div>
  );
}
