// The image + drawing surface: pixel-exact zoom/pan, polylines, a draft line that follows the cursor.
import { useEffect, useRef } from "preact/hooks";
import type { Obj, Pt } from "./labels";
import { distToPoly } from "./labels";

export type Look = { lut: Uint8ClampedArray }; // 256-entry grey LUT (contrast window applied)
type Props = {
  data: Uint8Array | null; // 256 × 256 grey bytes
  size: number;
  look: Look;
  objects: Obj[];
  selected: string | null;
  draft: Pt[];
  colors: (o: Obj) => string;
  fitKey: string; // re-fit when this changes (new scene)
  onClickPoint: (p: Pt) => void;
  onFinish: () => void;
  onSelect: (id: string | null) => void;
  onCursor?: (p: Pt | null) => void;
};

export function Viewer(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ s: 1, ox: 0, oy: 0, w: 0, h: 0 });
  const cursor = useRef<Pt | null>(null);
  const props = useRef(p);
  props.current = p;

  const toImg = (x: number, y: number): Pt => {
    const v = view.current;
    return [(y - v.oy) / v.s - 0.5, (x - v.ox) / v.s - 0.5];
  };
  const toScr = ([r, c]: Pt): [number, number] => {
    const v = view.current;
    return [v.ox + (c + 0.5) * v.s, v.oy + (r + 0.5) * v.s];
  };

  const draw = () => {
    const cv = canvas.current;
    if (!cv) return;
    const v = view.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, v.w, v.h);
    const q = props.current;
    if (off.current) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off.current, v.ox, v.oy, q.size * v.s, q.size * v.s);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(v.ox - 0.5, v.oy - 0.5, q.size * v.s + 1, q.size * v.s + 1);
    }
    const line = (pts: Pt[], color: string, width: number, dash: number[]) => {
      if (pts.length < 1) return;
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const [x, y] = toScr(pt);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.setLineDash(dash);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = width + 2.5;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const o of q.objects) {
      const sel = o.id === q.selected;
      line(o.polyline_px, q.colors(o), sel ? 3.4 : 2, o.confidence === "uncertain" ? [7, 6] : []);
      if (sel)
        for (const pt of o.polyline_px) {
          const [x, y] = toScr(pt);
          ctx.fillStyle = "#fff";
          ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
        }
    }
    if (q.draft.length) {
      const pts = cursor.current ? [...q.draft, cursor.current] : q.draft;
      line(pts, "#fff275", 2, [4, 4]);
      for (const pt of q.draft) {
        const [x, y] = toScr(pt);
        ctx.fillStyle = "#fff275";
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // image bytes + LUT → offscreen canvas
  useEffect(() => {
    if (!p.data) {
      off.current = null;
      draw();
      return;
    }
    const c = off.current ?? document.createElement("canvas");
    c.width = c.height = p.size;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(p.size, p.size);
    for (let i = 0; i < p.data.length; i++) {
      const g = p.look.lut[p.data[i]];
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    off.current = c;
    draw();
  }, [p.data, p.look]);

  // size + fit
  const fit = () => {
    const el = wrap.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const s = Math.max(1, Math.floor((Math.min(w, h) - 24) / p.size));
    view.current = { s, ox: Math.round((w - p.size * s) / 2), oy: Math.round((h - p.size * s) / 2), w, h };
    draw();
  };
  useEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [p.fitKey]);
  useEffect(draw);

  // pointer: click = point / select, drag = pan, wheel = zoom
  useEffect(() => {
    const cv = canvas.current!;
    let down: { x: number; y: number; ox: number; oy: number; pan: boolean; moved: boolean } | null = null;
    const rel = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const { x, y } = rel(e);
      cv.setPointerCapture(e.pointerId);
      down = { x, y, ox: view.current.ox, oy: view.current.oy, pan: e.button !== 0 || e.shiftKey, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = rel(e);
      const pt = toImg(x, y);
      cursor.current = pt;
      props.current.onCursor?.(pt);
      if (down) {
        const dx = x - down.x;
        const dy = y - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 4) down.moved = true;
        if (down.moved) {
          view.current.ox = down.ox + dx;
          view.current.oy = down.oy + dy;
          cv.style.cursor = "grabbing";
        }
      }
      draw();
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      cv.style.cursor = "";
      if (!d || d.moved || d.pan) return;
      const { x, y } = rel(e);
      const pt = toImg(x, y);
      const q = props.current;
      const inside = pt[0] >= -0.5 && pt[1] >= -0.5 && pt[0] <= q.size - 0.5 && pt[1] <= q.size - 0.5;
      if (!inside) return; // points must lie on the image
      if (q.draft.length) return q.onClickPoint(pt);
      // select the nearest line within 7 screen px, else start a new line
      let best: { id: string; d: number } | null = null;
      for (const o of q.objects) {
        const dd = distToPoly(pt, o.polyline_px) * view.current.s;
        if (dd < 7 && (!best || dd < best.d)) best = { id: o.id, d: dd };
      }
      if (best) q.onSelect(best.id);
      else {
        q.onSelect(null);
        q.onClickPoint(pt);
      }
    };
    const onDbl = (e: MouseEvent) => {
      e.preventDefault();
      props.current.onFinish();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = rel(e);
      const v = view.current;
      const fitS = Math.max(1, Math.floor((Math.min(v.w, v.h) - 24) / props.current.size));
      const s2 = Math.min(fitS * 16, Math.max(fitS * 0.5, v.s * Math.exp(-e.deltaY * 0.0018)));
      v.ox = x - ((x - v.ox) * s2) / v.s;
      v.oy = y - ((y - v.oy) * s2) / v.s;
      v.s = s2;
      draw();
    };
    const onLeave = () => {
      cursor.current = null;
      props.current.onCursor?.(null);
      draw();
    };
    const noMenu = (e: Event) => e.preventDefault();
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("dblclick", onDbl);
    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("pointerleave", onLeave);
    cv.addEventListener("contextmenu", noMenu);
    return () => {
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("dblclick", onDbl);
      cv.removeEventListener("wheel", onWheel);
      cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("contextmenu", noMenu);
    };
  }, []);

  return (
    <div ref={wrap} class="viewer">
      <canvas ref={canvas} data-testid="canvas" aria-label="Satellite image. Click to place points along a contrail, double-click to finish. Drag to pan, scroll to zoom." />
    </div>
  );
}

/** Contrast window (byte domain lo…hi) → LUT. */
export function makeLut(lo: number, hi: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const span = Math.max(1, hi - lo);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(((v - lo) / span) * 255);
  return lut;
}
