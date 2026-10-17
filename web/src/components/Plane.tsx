// Side view of an airliner, nose to the right (used in the hero and the figures).
export function Plane(p: { class?: string; width?: number }) {
  return (
    <svg class={p.class} viewBox="0 0 64 20" width={p.width ?? 56} height={((p.width ?? 56) * 20) / 64} aria-hidden="true">
      <path d="M3 10.6c0-1.6 2-2.6 5.4-2.6h43.2c4.3 0 8.4 1.1 11.4 2.9-3 1.6-7 2.4-11.4 2.4H8.4C5 13.3 3 12.3 3 10.6Z" fill="currentColor" />
      <path d="M4.2 8.2 1.6 1.2h4.1l7.6 7Z" fill="currentColor" />
      <path d="M2.6 10.4h9.6l-2.2 2.3H3.2Z" fill="currentColor" opacity=".55" />
      <path d="M24.5 11.6h12.6l-8.4 6.6h-4.4Z" fill="currentColor" />
      <rect x="27" y="13.2" width="8.6" height="3" rx="1.5" fill="currentColor" opacity=".75" />
      <path d="M56.6 9.4c1.6.2 3.2.6 4.4 1.1" stroke="var(--paper)" stroke-width=".9" stroke-linecap="round" fill="none" opacity=".8" />
    </svg>
  );
}
