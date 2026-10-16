// Scroll-reveal: elements with class "reveal" fade up the first time they enter the view.
// Respects prefers-reduced-motion (everything is shown immediately).
export function startReveal(): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = new WeakSet<Element>();
  const io =
    "IntersectionObserver" in window && !reduce
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("in");
                io?.unobserve(e.target);
              }
            }),
          { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
        )
      : null;
  const scan = () =>
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (io) io.observe(el);
      else el.classList.add("in");
    });
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    mo.disconnect();
    io?.disconnect();
  };
}
