// A headline whose words rise one after another out of their own masks (see .split in base.css).
// The text stays one readable string for screen readers and search engines.
export function Split(p: { text: string; base?: number; start?: number; class?: string }) {
  const words = p.text.split(" ");
  return (
    <span class={`split ${p.class ?? ""}`} style={{ "--base": p.base ?? 0 }}>
      {words.map((w, i) => (
        <>
          <span class="w">
            <span style={{ "--i": (p.start ?? 0) + i }}>{w}</span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </>
      ))}
    </span>
  );
}
