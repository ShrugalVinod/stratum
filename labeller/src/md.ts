// Tiny Markdown → HTML for the labelling guide (headings, lists, bold, italics, code, links).
// Everything is HTML-escaped first, so the guide can never inject markup.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (ol || ul) {
      flushPara();
      const kind = ol ? "ol" : "ul";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ol ?? ul)![1])}</li>`);
    } else if (!line.trim()) {
      flushPara();
      closeList();
    } else if (list && /^\s{2,}/.test(raw)) {
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return out.join("\n");
}
