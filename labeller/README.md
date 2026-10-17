# STRATUM Labeller

A small static web app for hand-labelling contrails in Meteosat-9 scenes (build prompt §5.2,
paper §4.4). Team-internal; hosted at its own link, separate from the STRATUM website.

* **Code only.** The scene packages (`pilot.zip`, `main.zip`) come from the team Drive
  (`STRATUM/labels/scenes/`) and are opened from the labeller's own laptop. Nothing is uploaded.
  EUMETSAT imagery is never published.
* Works offline once loaded; any laptop with Chrome, Edge, Firefox or Safari.
* Each labeller sees only their own labels, in their own fixed random order.
* Autosave in the browser (`localStorage`); **Export** downloads a zip with one JSON per scene.
* **Adjudicate** mode shows both labellers' lines (A orange, B blue) to settle disagreements
  by discussion; its export is the adjudicated set (`labels/adjudicated/`).

The labelling rules are in `docs/labelling_guide.md` (bundled into the app and into every
scene zip; press **H** in the app).

## Label file (one per scene)

```json
{
  "scene_id": "S014",
  "labeller": "aditya",
  "app_version": "1.0.0",
  "package_version": "1.0",
  "scene_status": "clear | partly_obscured | obscured | null",
  "flags": { "no_contrails": false, "unusable": false, "unusable_reason": "" },
  "objects": [{ "id": "o…", "polyline_px": [[row, col], …], "confidence": "sure | uncertain" }],
  "started_at": "ISO time", "updated_at": "ISO time", "time_spent_s": 192
}
```

Coordinates are **package pixels, north-up, pixel centres at integers 0…255** (`[row, col]`).
`stratum/labelling/packages.py: package_to_native` maps them to the stored satellite crop
(`native = (r0 + 255 − row, c0 + 255 − col)`, using `labels/scenes/scenes.csv`).
`stratum/labelling/agreement.py: read_label` reads exactly this format
(contract test: `tests/labelling/test_agreement.py::test_reads_the_labeller_app_export_format`).

A scene counts as labelled when its status is set and it has lines or "No contrails", or it is
marked unusable with a reason. Lines shorter than 10 px cannot be saved (rule 1).

## Develop

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run e2e        # Playwright: draw a polyline, export, validate the JSON
npm run build      # → dist/
```

## Hosting (Cloudflare Workers static assets, free)

Separate Cloudflare project from the website: root directory `labeller`, build `npm run build`,
deploy `npx wrangler deploy`, `NODE_VERSION=22` (config: `wrangler.jsonc`, name
`stratum-labeller`). `robots.txt` and a `noindex` tag keep it out of search engines.
