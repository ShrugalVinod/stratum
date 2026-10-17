// STRATUM Labeller: label contrails in Meteosat-9 scene packages (build prompt §5.2).
// Two modes: "Label" (one labeller, their own labels only) and "Adjudicate" (both labellers'
// lines on one image; keep, delete or redraw; export the agreed set).
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import guideFallback from "../../docs/labelling_guide.md?raw";
import {
  APP_VERSION,
  type Confidence,
  dedupe,
  emptyLabel,
  exportZip,
  isComplete,
  loadSaved,
  MIN_LENGTH_PX,
  type Obj,
  type Pt,
  polyLength,
  problems,
  save,
  type SceneLabel,
  seededOrder,
  type Status,
} from "./labels";
import { mdToHtml } from "./md";
import { decodeGrey, type Frame, FRAME_FILE, type PackageSet, readLabelExport, readPackageZip } from "./packages";
import { makeLut, Viewer } from "./viewer";

type Layer = "btd" | "t108";
type Mode = "label" | "adjudicate";
type Session = {
  mode: Mode;
  labeller: string; // "adjudicated" in adjudication mode
  pkg: PackageSet;
  order: string[];
  others?: { a: { labeller: string; labels: Map<string, SceneLabel> }; b: { labeller: string; labels: Map<string, SceneLabel> } };
};

const STATUS: [Status, string][] = [
  ["clear", "Clear"],
  ["partly_obscured", "Partly obscured"],
  ["obscured", "Obscured"],
];
const BTD_DEFAULT: [number, number] = [-1, 4];
const T108_DEFAULT: [number, number] = [200, 300];
let uid = 0;
const newId = () => `o${Date.now().toString(36)}${(uid++).toString(36)}`;

async function readFile(f: File): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer());
}
function download(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const ist = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} IST`;
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [help, setHelp] = useState(false);
  const guide = session?.pkg.guide ?? guideFallback;
  return (
    <>
      {session ? <Workspace s={session} onHelp={() => setHelp(true)} onQuit={() => setSession(null)} /> : <Start onStart={setSession} onHelp={() => setHelp(true)} />}
      {help && (
        <div class="modal" role="dialog" aria-modal="true" aria-label="Labelling guide" onClick={() => setHelp(false)}>
          <article class="guide" onClick={(e) => e.stopPropagation()}>
            <button class="btn close" onClick={() => setHelp(false)} autoFocus>
              Close
            </button>
            <div dangerouslySetInnerHTML={{ __html: mdToHtml(guide) }} />
          </article>
        </div>
      )}
    </>
  );
}

// ── start screen ─────────────────────────────────────────────────────────────
function Start({ onStart, onHelp }: { onStart: (s: Session) => void; onHelp: () => void }) {
  const [mode, setMode] = useState<Mode>("label");
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem("stratum-labeller:last-id") ?? "";
    } catch {
      return "";
    }
  });
  const [pkgFile, setPkgFile] = useState<File | null>(null);
  const [aFile, setAFile] = useState<File | null>(null);
  const [bFile, setBFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

  const go = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (!pkgFile) throw new Error("Choose the scene package zip (pilot.zip or main.zip).");
      const pkg = readPackageZip(await readFile(pkgFile), pkgFile.name);
      const ids = [...pkg.scenes.keys()];
      if (mode === "label") {
        if (!clean) throw new Error("Type your labeller ID (aditya or ishaan).");
        try {
          localStorage.setItem("stratum-labeller:last-id", clean);
        } catch {
          /* not remembered */
        }
        onStart({ mode, labeller: clean, pkg, order: seededOrder(ids, `${clean}|${pkg.name}`) });
      } else {
        if (!aFile || !bFile) throw new Error("Choose both labellers' export zips.");
        const a = readLabelExport(await readFile(aFile), aFile.name);
        const b = readLabelExport(await readFile(bFile), bFile.name);
        onStart({ mode, labeller: "adjudicated", pkg, order: [...ids].sort(), others: { a, b } });
      }
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="start">
      <header>
        <p class="kicker">STRATUM · team-internal</p>
        <h1>Contrail labeller</h1>
        <p class="lead">
          Draw every contrail you see in Meteosat-9 scenes. Your files never leave this laptop: the app only reads the zip you choose and saves
          your work in this browser until you export it.
        </p>
      </header>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "label"} class={mode === "label" ? "on" : ""} onClick={() => setMode("label")}>
          Label
        </button>
        <button role="tab" aria-selected={mode === "adjudicate"} class={mode === "adjudicate" ? "on" : ""} onClick={() => setMode("adjudicate")}>
          Adjudicate
        </button>
      </div>
      <form
        class="card"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        {mode === "label" && (
          <label class="field">
            <span>Your labeller ID</span>
            <input value={id} onInput={(e) => setId((e.target as HTMLInputElement).value)} placeholder="aditya or ishaan" autocomplete="off" />
            <small>Always use the same ID. It decides your scene order and where your work is saved.</small>
          </label>
        )}
        <label class="field">
          <span>Scene package</span>
          <input type="file" accept=".zip" data-testid="pkg" onChange={(e) => setPkgFile((e.target as HTMLInputElement).files?.[0] ?? null)} />
          <small>pilot.zip first, main.zip after the pilot is discussed.</small>
        </label>
        {mode === "adjudicate" && (
          <>
            <label class="field">
              <span>Labeller A export</span>
              <input type="file" accept=".zip,.json" onChange={(e) => setAFile((e.target as HTMLInputElement).files?.[0] ?? null)} />
            </label>
            <label class="field">
              <span>Labeller B export</span>
              <input type="file" accept=".zip,.json" onChange={(e) => setBFile((e.target as HTMLInputElement).files?.[0] ?? null)} />
            </label>
            <small>Both labellers' lines appear on one image (A orange, B blue). Keep, delete or redraw until you both agree, then export.</small>
          </>
        )}
        {err && (
          <p class="error" role="alert">
            {err}
          </p>
        )}
        <div class="row">
          <button class="btn primary" type="submit" disabled={busy}>
            {busy ? "Opening…" : "Start"}
          </button>
          <button class="btn" type="button" onClick={onHelp}>
            Read the labelling guide
          </button>
        </div>
      </form>
      <p class="fine">
        Meteosat-9 imagery © EUMETSAT 2026, for the team's labelling only. v{APP_VERSION}
      </p>
    </main>
  );
}

// ── the labelling workspace ──────────────────────────────────────────────────
function Workspace({ s, onHelp, onQuit }: { s: Session; onHelp: () => void; onQuit: () => void }) {
  const [idx, setIdx] = useState(() => {
    const first = s.order.findIndex((sid) => !isComplete(loadSaved(s.labeller, sid)));
    return first < 0 ? 0 : first;
  });
  const sid = s.order[idx];
  const pkg = s.pkg.scenes.get(sid)!;
  const [labels, setLabels] = useState<Map<string, SceneLabel>>(() => {
    const m = new Map<string, SceneLabel>();
    for (const id of s.order) {
      const saved = loadSaved(s.labeller, id);
      if (saved) m.set(id, saved);
      else if (s.mode === "adjudicate") m.set(id, seedAdjudication(id, s));
    }
    return m;
  });
  const label = labels.get(sid) ?? emptyLabel(sid, s.labeller, s.pkg.scenes.get(sid)!.meta.package_version);
  const [hist, setHist] = useState<Record<string, { past: Obj[][]; future: Obj[][] }>>({});
  const [layer, setLayer] = useState<Layer>("btd");
  const [frame, setFrame] = useState<Frame>("t");
  const [btdWin, setBtdWin] = useState<[number, number]>(BTD_DEFAULT);
  const [t108Win, setT108Win] = useState<[number, number]>(T108_DEFAULT);
  const [newConf, setNewConf] = useState<Confidence>("sure");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [img, setImg] = useState<Uint8Array | null>(null);
  const [cur, setCur] = useState<Pt | null>(null);
  const cache = useRef(new Map<string, Uint8Array>());
  const saveOk = useRef(true);

  // image for scene/layer/frame
  useEffect(() => {
    const file = `${layer}${FRAME_FILE[frame]}.png`;
    const key = `${sid}/${file}`;
    const hit = cache.current.get(key);
    if (hit) return setImg(hit);
    let live = true;
    const bytes = pkg.files[file];
    if (!bytes) return setImg(null);
    decodeGrey(bytes).then((g) => {
      cache.current.set(key, g.data);
      if (live) setImg(g.data);
    });
    return () => {
      live = false;
    };
  }, [sid, layer, frame]);

  useEffect(() => {
    setDraft([]);
    setSelected(null);
    setFrame("t");
    setMsg(null);
  }, [sid]);

  // time spent on the open scene (only while the tab is visible)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      update((l) => ({ ...l, time_spent_s: l.time_spent_s + 1 }), false);
    }, 1000);
    return () => clearInterval(id);
  }, [sid]);

  function update(fn: (l: SceneLabel) => SceneLabel, stamp = true) {
    setLabels((m) => {
      const base = m.get(sid) ?? emptyLabel(sid, s.labeller, pkg.meta.package_version);
      const next = fn(base);
      const out = { ...next, updated_at: stamp ? new Date().toISOString() : next.updated_at };
      saveOk.current = save(out);
      const n = new Map(m);
      n.set(sid, out);
      return n;
    });
  }
  function setObjects(objs: Obj[]) {
    setHist((h) => {
      const cur = h[sid] ?? { past: [], future: [] };
      return { ...h, [sid]: { past: [...cur.past, label.objects].slice(-100), future: [] } };
    });
    update((l) => ({ ...l, objects: objs, flags: { ...l.flags, no_contrails: objs.length ? false : l.flags.no_contrails } }));
  }
  const undo = () => {
    const h = hist[sid];
    if (!h?.past.length) return;
    const prev = h.past[h.past.length - 1];
    setHist({ ...hist, [sid]: { past: h.past.slice(0, -1), future: [label.objects, ...h.future] } });
    update((l) => ({ ...l, objects: prev }));
  };
  const redo = () => {
    const h = hist[sid];
    if (!h?.future.length) return;
    const nxt = h.future[0];
    setHist({ ...hist, [sid]: { past: [...h.past, label.objects], future: h.future.slice(1) } });
    update((l) => ({ ...l, objects: nxt }));
  };
  const finish = () => {
    const pts = dedupe(draft);
    if (pts.length < 2) return setDraft([]);
    if (polyLength(pts) < MIN_LENGTH_PX) {
      setMsg(`Too short: ${polyLength(pts).toFixed(1)} px. Contrails must be at least ${MIN_LENGTH_PX} px long (rule 1). Keep clicking or press Esc.`);
      return;
    }
    const o: Obj = { id: newId(), polyline_px: pts, confidence: newConf, ...(s.mode === "adjudicate" ? { source: "adjudicator" } : {}) };
    setObjects([...label.objects, o]);
    setDraft([]);
    setSelected(o.id);
    setMsg(null);
  };
  const del = (id: string | null) => {
    if (!id) return;
    setObjects(label.objects.filter((o) => o.id !== id));
    setSelected(null);
  };
  const toggleConf = (id: string | null) => {
    if (!id) return setNewConf(newConf === "sure" ? "uncertain" : "sure");
    setObjects(label.objects.map((o) => (o.id === id ? { ...o, confidence: o.confidence === "sure" ? "uncertain" : "sure" } : o)));
  };
  const go = (d: number) => {
    if (draft.length) return setMsg("Finish the line first (double-click or Enter) or press Esc to drop it.");
    setIdx((i) => Math.max(0, Math.min(s.order.length - 1, i + d)));
  };
  const doExport = () => {
    const all = s.order.map((id) => labels.get(id)).filter((l): l is SceneLabel => !!l);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    download(exportZip(all, s.labeller), `labels_${s.labeller}_${s.pkg.name.replace(/\.zip$/i, "")}_${stamp}.zip`);
  };

  // keyboard
  const keyState = useRef({ draft, selected, label });
  keyState.current = { draft, selected, label };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && k.toLowerCase() === "z") {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (k === "Enter") return finish();
      if (k === "Escape") {
        setDraft([]);
        setSelected(null);
        return setMsg(null);
      }
      if (k === "Delete" || k === "Backspace") return del(keyState.current.selected);
      if (k === "1") return setFrame("m15");
      if (k === "2") return setFrame("t");
      if (k === "3") return setFrame("p15");
      if (k.toLowerCase() === "t") return setLayer((l) => (l === "btd" ? "t108" : "btd"));
      if (k.toLowerCase() === "u") return toggleConf(keyState.current.selected);
      if (k.toLowerCase() === "n" || k === "ArrowRight") return go(1);
      if (k.toLowerCase() === "p" || k === "ArrowLeft") return go(-1);
      if (k.toLowerCase() === "h" || k === "?") return onHelp();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const enc = pkg.meta.encoding;
  const lut = useMemo(() => {
    if (layer === "btd") {
      const b = (K: number) => ((K - enc.btd_k.min) / (enc.btd_k.max - enc.btd_k.min)) * 255;
      return makeLut(b(btdWin[0]), b(btdWin[1]));
    }
    // T10.8 is stored inverted (cold = bright): warm limit → low byte
    const b = (K: number) => (1 - (K - enc.t108_k.min) / (enc.t108_k.max - enc.t108_k.min)) * 255;
    return makeLut(b(t108Win[1]), b(t108Win[0]));
  }, [layer, btdWin, t108Win, sid]);
  const look = useMemo(() => ({ lut }), [lut]);

  const done = s.order.filter((id) => isComplete(labels.get(id))).length;
  const issues = problems(label);
  const colors = (o: Obj) => (o.source === "A" ? "#ff9f1c" : o.source === "B" ? "#3ec6ff" : o.source === "adjudicator" ? "#ff5cc8" : "#ffb02e");
  const others = s.others;

  return (
    <div class="ws">
      <header class="bar">
        <b>STRATUM Labeller</b>
        <span class="pill">{s.mode === "label" ? `Labeller: ${s.labeller}` : "Adjudication"}</span>
        <span class="muted">{s.pkg.name}</span>
        <span class="progress" aria-label={`${done} of ${s.order.length} scenes complete`}>
          <i style={{ width: `${(done / s.order.length) * 100}%` }} />
        </span>
        <span class="mono">
          {done}/{s.order.length} done
        </span>
        {!saveOk.current && <span class="warn">Browser storage is blocked: export often!</span>}
        <span class="sp" />
        <button class="btn" onClick={onHelp}>
          Guide (H)
        </button>
        <button class="btn primary" onClick={doExport} data-testid="export">
          Export
        </button>
        <button class="btn" onClick={() => confirm("Leave this set? Your work stays saved in this browser.") && onQuit()}>
          Close
        </button>
      </header>

      <div class="main">
        <section class="stage">
          <div class="tools" role="toolbar" aria-label="View">
            <div class="seg" role="group" aria-label="Image">
              <button class={layer === "btd" ? "on" : ""} onClick={() => setLayer("btd")}>
                BTD
              </button>
              <button class={layer === "t108" ? "on" : ""} onClick={() => setLayer("t108")}>
                T10.8
              </button>
            </div>
            <div class="seg" role="group" aria-label="Time">
              {(["m15", "t", "p15"] as Frame[]).map((f, i) => (
                <button class={frame === f ? "on" : ""} onClick={() => setFrame(f)} title={`key ${i + 1}`}>
                  {f === "m15" ? "−15 min" : f === "t" ? "t" : "+15 min"}
                </button>
              ))}
            </div>
            <label class="win">
              <span>{layer === "btd" ? "BTD" : "T10.8"} min</span>
              <input
                type="range"
                min={layer === "btd" ? -4 : 180}
                max={layer === "btd" ? 8 : 310}
                step={layer === "btd" ? 0.1 : 1}
                value={layer === "btd" ? btdWin[0] : t108Win[0]}
                onInput={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (layer === "btd") setBtdWin([Math.min(v, btdWin[1] - 0.2), btdWin[1]]);
                  else setT108Win([Math.min(v, t108Win[1] - 2), t108Win[1]]);
                }}
              />
            </label>
            <label class="win">
              <span>max</span>
              <input
                type="range"
                min={layer === "btd" ? -4 : 180}
                max={layer === "btd" ? 8 : 310}
                step={layer === "btd" ? 0.1 : 1}
                value={layer === "btd" ? btdWin[1] : t108Win[1]}
                onInput={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (layer === "btd") setBtdWin([btdWin[0], Math.max(v, btdWin[0] + 0.2)]);
                  else setT108Win([t108Win[0], Math.max(v, t108Win[0] + 2)]);
                }}
              />
            </label>
            <span class="mono small">{layer === "btd" ? `${btdWin[0].toFixed(1)} … ${btdWin[1].toFixed(1)} K` : `${t108Win[0]} … ${t108Win[1]} K`}</span>
            <button class="btn small" onClick={() => (layer === "btd" ? setBtdWin(BTD_DEFAULT) : setT108Win(T108_DEFAULT))}>
              Reset
            </button>
          </div>
          <Viewer
            data={img}
            size={pkg.meta.size_px}
            look={look}
            objects={label.objects}
            selected={selected}
            draft={draft}
            colors={colors}
            fitKey={sid}
            onClickPoint={(p) => setDraft((d) => [...d, p])}
            onFinish={finish}
            onSelect={setSelected}
            onCursor={setCur}
          />
          <div class="hint">
            {draft.length
              ? `Drawing: ${draft.length} point${draft.length > 1 ? "s" : ""} · double-click or Enter to finish · Esc to cancel`
              : "Click along a contrail's centre to draw · click a line to select it · drag to pan · scroll to zoom · 1/2/3 time · T image · U sure/uncertain"}
            <span class="mono">{cur ? `row ${cur[0].toFixed(1)} · col ${cur[1].toFixed(1)}` : ""}</span>
          </div>
          {msg && (
            <p class="msg" role="status">
              {msg}
            </p>
          )}
        </section>

        <aside class="side">
          <div class="scene-head">
            <h2 data-testid="scene-id">{sid}</h2>
            <span class="mono small">
              scene {idx + 1} of {s.order.length}
            </span>
          </div>
          <p class="mono small muted">
            {pkg.meta.time_utc.replace("T", " ").replace(":00Z", " UTC")} · {ist(pkg.meta.time_utc)}
            <br />
            N {pkg.meta.corners_latlon.top_left[0].toFixed(1)}° · S {pkg.meta.corners_latlon.bottom_left[0].toFixed(1)}° · W{" "}
            {pkg.meta.corners_latlon.top_left[1].toFixed(1)}°E · E {pkg.meta.corners_latlon.top_right[1].toFixed(1)}°E
          </p>

          {others && (
            <div class="adj">
              <p>
                <b style={{ color: "#ff9f1c" }}>A · {others.a.labeller}</b>: {others.a.labels.get(sid)?.scene_status ?? "—"}
                {others.a.labels.get(sid)?.flags.no_contrails ? " · no contrails" : ""}
                <br />
                <b style={{ color: "#3ec6ff" }}>B · {others.b.labeller}</b>: {others.b.labels.get(sid)?.scene_status ?? "—"}
                {others.b.labels.get(sid)?.flags.no_contrails ? " · no contrails" : ""}
              </p>
            </div>
          )}

          <fieldset class="status">
            <legend>Scene status</legend>
            {STATUS.map(([v, txt]) => (
              <label>
                <input type="radio" name="status" checked={label.scene_status === v} onChange={() => update((l) => ({ ...l, scene_status: v }))} /> {txt}
              </label>
            ))}
          </fieldset>

          <div class="row wrap">
            <button
              class={`btn ${label.flags.no_contrails ? "on" : ""}`}
              aria-pressed={label.flags.no_contrails}
              disabled={label.objects.length > 0}
              title={label.objects.length ? "Delete the lines first" : "This scene has no contrails"}
              onClick={() => update((l) => ({ ...l, flags: { ...l.flags, no_contrails: !l.flags.no_contrails } }))}
            >
              No contrails
            </button>
            <button
              class={`btn ${label.flags.unusable ? "on" : ""}`}
              aria-pressed={label.flags.unusable}
              onClick={() => update((l) => ({ ...l, flags: { ...l.flags, unusable: !l.flags.unusable } }))}
            >
              Unusable
            </button>
            <button class="btn" onClick={() => toggleConf(null)} title="Confidence of new lines (U with nothing selected)">
              New lines: <b>{newConf}</b>
            </button>
          </div>
          {label.flags.unusable && (
            <label class="field">
              <span>Why is it unusable?</span>
              <input value={label.flags.unusable_reason} onInput={(e) => update((l) => ({ ...l, flags: { ...l.flags, unusable_reason: (e.target as HTMLInputElement).value } }))} />
            </label>
          )}

          <h3>
            Lines <span class="muted">({label.objects.length})</span>
          </h3>
          <ol class="lines">
            {label.objects.map((o, i) => (
              <li class={o.id === selected ? "sel" : ""}>
                <button class="lnk" onClick={() => setSelected(o.id)}>
                  <i style={{ background: colors(o) }} /> #{i + 1} · {polyLength(o.polyline_px).toFixed(0)} px{o.source && o.source !== "adjudicator" ? ` · ${o.source}` : ""}
                </button>
                <button class={`chip ${o.confidence}`} onClick={() => toggleConf(o.id)}>
                  {o.confidence}
                </button>
                <button class="chip del" onClick={() => del(o.id)} aria-label={`Delete line ${i + 1}`}>
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <div class="row">
            <button class="btn small" onClick={undo} disabled={!hist[sid]?.past.length}>
              Undo
            </button>
            <button class="btn small" onClick={redo} disabled={!hist[sid]?.future.length}>
              Redo
            </button>
          </div>

          {issues.length > 0 ? (
            <ul class="issues">
              {issues.map((t) => (
                <li>{t}</li>
              ))}
            </ul>
          ) : (
            <p class="ok">✓ Scene complete</p>
          )}

          <div class="row nav">
            <button class="btn" onClick={() => go(-1)} disabled={idx === 0}>
              ← Previous
            </button>
            <button class="btn primary" onClick={() => go(1)} disabled={idx === s.order.length - 1} data-testid="next">
              Next →
            </button>
          </div>
          <details class="jump">
            <summary>All scenes</summary>
            <div class="grid">
              {s.order.map((id, i) => (
                <button class={`${isComplete(labels.get(id)) ? "done" : ""} ${i === idx ? "cur" : ""}`} onClick={() => setIdx(i)}>
                  {id}
                </button>
              ))}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

/** Adjudication starts from both labellers' lines (tagged A and B); the status only if they agree. */
function seedAdjudication(sid: string, s: Session): SceneLabel {
  const pv = s.pkg.scenes.get(sid)!.meta.package_version;
  const l = emptyLabel(sid, "adjudicated", pv);
  const a = s.others?.a.labels.get(sid);
  const b = s.others?.b.labels.get(sid);
  l.objects = [...(a?.objects ?? []).map((o) => ({ ...o, id: newId(), source: "A" })), ...(b?.objects ?? []).map((o) => ({ ...o, id: newId(), source: "B" }))];
  if (a && b && a.scene_status === b.scene_status) l.scene_status = a.scene_status;
  if (a?.flags.no_contrails && b?.flags.no_contrails) l.flags.no_contrails = true;
  return l;
}
