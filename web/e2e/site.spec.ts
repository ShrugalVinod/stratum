// End-to-end checks of the STRATUM website (Phase 4 open item a; port of the 19 local checks).
import zlib from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function openMap(page: Page) {
  await page.goto("/map");
  await expect(page.locator(".map-canvas.ready")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".strip").first()).toBeVisible();
  // let the intro replay finish (≈ 7 s) so clicks are not swallowed by camera moves
  await page.waitForTimeout(9_000);
}

/** Wait until the camera has stopped (a selection flies the map to it). */
async function mapStill(page: Page) {
  await expect.poll(() => page.evaluate(() => !(window as any).__map.isMoving()), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(600);
}

/** Screen position of a feature in a map layer that the predicate accepts (dev build only). */
async function featurePoint(page: Page, layer: string, avoid: string[]) {
  return page.evaluate(
    ({ layer, avoid }) => {
      const m = (window as any).__map;
      const r = m.getCanvas().getBoundingClientRect();
      for (const f of m.queryRenderedFeatures({ layers: [layer] }).slice(0, 4000)) {
        const c = f.geometry.coordinates;
        const p = m.project([(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2]);
        if (p.x < 30 || p.y < 30 || p.x > r.width - 30 || p.y > r.height - 30) continue;
        const hits = avoid.length ? m.queryRenderedFeatures([[p.x - 6, p.y - 6], [p.x + 6, p.y + 6]], { layers: avoid }) : [];
        const x = r.left + p.x;
        const y = r.top + p.y;
        // the point must be on the bare map, not under the legend, chips or the side list
        if (!hits.length && document.elementFromPoint(x, y) === m.getCanvas()) return { x, y };
      }
      return null;
    },
    { layer, avoid },
  );
}

test("map: STRATUM list and card, model switcher, flights, controls", async ({ page }) => {
  test.setTimeout(240_000); // software WebGL on CI runners is several times slower than a laptop
  const errors = collectErrors(page);
  await openMap(page); // default: STRATUM on the first held-out flight day
  await expect(page.locator('.model-ctl button[aria-checked="true"]')).toHaveText("STRATUM");
  expect(await page.locator(".strip").count()).toBeGreaterThan(0);

  // a STRATUM candidate opens the card: level advice, alternatives table, humidity profile
  await page.locator(".strip").first().click();
  await expect(page.locator(".life-num")).toHaveText(/^FL\d{3}$/);
  await expect(page.locator(".dk-flight b")).not.toBeEmpty();
  await expect(page.locator(".alt-table")).toBeVisible();
  await expect(page.locator(".dk-prof svg")).toBeVisible();
  await expect.poll(() => page.url()).toContain("seg=");
  await page.locator(".dk-end .tool").click();
  await expect(page.locator(".deck")).toHaveCount(0);

  // uncorrected physics: same list and a card with the contrail lifetime
  await page.locator(".model-ctl button", { hasText: "Physics" }).click();
  await expect.poll(() => page.url()).toContain("m=B1");
  await expect(page.locator(".strip").first()).toBeVisible();
  await page.locator(".strip").first().click();
  await expect(page.locator(".life-num")).toHaveText(/h$/);
  const nav1 = await page.locator(".sc-nav .mono").textContent();
  if (/\/ [2-9]/.test(nav1 ?? "")) {
    await page.locator('.sc-nav button[aria-label^="Next"]').click();
    await expect(page.locator(".sc-nav .mono")).not.toHaveText(nav1 ?? "");
  }
  await page.locator(".dk-end .tool").click();

  // a flight with no flagged segment: flight details + the sky column
  await mapStill(page);
  const pt = await featurePoint(page, "legs", ["flagged", "planes"]);
  expect(pt, "an unflagged track on screen").not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  await expect(page.locator(".deck")).toBeVisible();
  await expect(page.locator(".sky-col")).toBeVisible();
  await page.locator(".dk-end .tool").click();

  // controls: flight level, hour by keyboard, layers, gallery lightbox, theme, empty day
  await page.locator(".tape button").nth(2).click();
  await expect.poll(() => page.url()).toContain("fl=");
  await page.locator(".tl-input").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.url()).toMatch(/hour=/);
  await page.locator(".layers .tool").click();
  await expect(page.locator(".layers-menu")).toBeVisible();
  await page.locator(".layers .tool").click();
  await page.locator(".gal-card").first().click();
  await expect(page.locator(".lightbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lightbox")).toHaveCount(0);
  await page.locator(".theme-btn").click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  // the map restyles for night mode; with software WebGL (CI) that keeps the page busy, so wait
  // until the new style has loaded before toggling back
  await expect
    .poll(() => page.evaluate(() => (window as any).__map?.isStyleLoaded?.() ?? true), { timeout: 120_000 })
    .toBe(true);
  await mapStill(page);
  await page.locator(".theme-btn").click();
  // a January day without flights offers the nearest flight day
  await page.locator(".date-pick select").first().selectOption("2026-01-20");
  await expect(page.locator(".empty")).toBeVisible();
  await expect(page.locator(".empty .tool")).toContainText("1 Feb 2026", { ignoreCase: true });
  await page.locator(".empty .tool").click();
  await expect(page.locator(".strip").first()).toBeVisible();

  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("every page renders without errors", async ({ page }) => {
  const errors = collectErrors(page);
  for (const path of ["/", "/how-it-works", "/progress", "/results", "/methods", "/team", "/about-data", "/contact", "/game", "/3d", "/airlines", "/sandbox", "/report", "/replay", "/now"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  await page.goto("/nope");
  await expect(page.getByText("404")).toBeVisible();
  // credits and the AI-use statement must stay on the site
  await page.goto("/about-data");
  await expect(page.locator("#ai-use")).toBeVisible();
  await expect(page.locator("footer")).toContainText("EUMETSAT");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("phone layout has no horizontal scroll", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const path of ["/", "/map"]) {
    await page.goto(path);
    await page.waitForTimeout(3_000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `horizontal scroll on ${path}`).toBe(false);
  }
  await ctx.close();
});

test("a page whose code fails to load is opened by a full reload, not left on Home", async ({ page }) => {
  await page.goto("/");
  let blocked = 0;
  // first request for the Methods page code fails (as after a deploy or a stopped server)
  await page.route(/\/(assets\/Methods-[^/]+\.js|src\/pages\/Methods\.tsx)/, (route) => {
    if (blocked++ === 0) return route.abort();
    return route.continue();
  });
  await page.locator(".menu-btn").click();
  await page.locator('#side-nav a[href="/methods"]').click();
  await expect(page.locator("h1")).toContainText("before results", { timeout: 15_000 });
  expect(page.url()).toContain("/methods");
  expect(blocked).toBeGreaterThanOrEqual(2);
});

test("results page shows the four pre-registered hypotheses from results.json", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/results");
  for (const h of ["H1", "H2", "H3", "H4"]) await expect(page.getByText(h, { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("20261018T113902Z_4a82cfa"); // final-runs log
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("booth mode tours the site and pauses on interaction", async ({ page }) => {
  await page.goto("/?booth=1");
  const chip = page.locator(".booth-chip");
  await expect(chip).toContainText("Tour 1/");
  await page.mouse.click(5, 300);
  await expect(chip).toContainText("paused");
});

test("live pages work without live data (outlook or aircraft feed missing)", async ({ page }) => {
  // the daily outlook and the aircraft feed come from outside the repo; a missing file or an
  // unreachable feed must leave a working page with a message, never a broken one
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/live", "/advisory", "/spot", "/routes"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  await page.goto("/live");
  await page.getByRole("radio", { name: "Delhi" }).click();
  await expect(page.locator(".live-count").first()).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("Beat STRATUM: a round can be answered and shows the satellite picture", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/game");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(".gm-card")).toBeVisible();
  await expect(page.locator(".gm-top")).toContainText("Flight 1 of 10");
  await page.keyboard.press("y");
  await expect(page.locator(".gm-verdict")).toBeVisible();
  await expect(page.locator(".gm-sat img")).toHaveJSProperty("complete", true);
  await expect(page.locator(".gm-answers li")).toHaveCount(3);
  await page.keyboard.press("Enter");
  await expect(page.locator(".gm-top")).toContainText("Flight 2 of 10");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("map card explains its prediction and the weighted decisions can be shown", async ({ page }) => {
  await page.goto("/map?date=2026-02-01&hour=20&fl=360&model=STRATUM&seg=top");
  await expect(page.locator(".map-canvas.ready")).toBeVisible({ timeout: 60_000 });
  await page.locator(".why-toggle").click();
  await expect(page.locator(".why-bars li").first()).toBeVisible();
  expect(await page.locator(".why-bars li").count()).toBeGreaterThanOrEqual(4);
  await page.getByRole("radio", { name: "Weighted (D-006)" }).click();
  await expect(page.locator(".filter-row .mono-s.muted").first()).toContainText("60 shown");
});

test("Spot a contrail: a photo stays in the browser and an answer appears", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => r.method() !== "GET" && posts.push(r.url()));
  await page.goto("/spot");
  // a 1×1 JPEG without EXIF: the page asks for time and place instead
  const jpg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  await page.setInputFiles('input[type="file"]', { name: "sky.jpg", mimeType: "image/jpeg", buffer: jpg });
  await expect(page.getByText("no time saved in the photo")).toBeVisible();
  await page.getByRole("button", { name: "Delhi" }).click();
  await page.getByRole("button", { name: "Find the plane" }).click();
  await expect(page.locator(".spot-out .live-card, .spot-out .live-err, .spot-form .live-err").first()).toBeVisible({ timeout: 60_000 });
  expect(posts, "the photo must never be sent anywhere").toHaveLength(0);
});

test("the site switches to Hindi, remembers it, and switches back to English", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: /switch to Hindi/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.locator("h1").first()).toContainText("विमान हटाइए");
  await page.reload();
  await expect(page.locator("h1").first()).toContainText("विमान हटाइए"); // remembered
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1").first()).toContainText("Move the plane");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("Hindi reaches the results, the map controls and the AI-translation note", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/results?lang=hi");
  await expect(page.locator(".res-card").first()).toContainText("समर्थित नहीं"); // H1 verdict
  await page.goto("/map?date=2026-02-01&lang=hi");
  await expect(page.getByRole("button", { name: "लिंक कॉपी करें" })).toBeVisible();
  await page.goto("/about-data?lang=hi");
  await expect(page.locator("#ai-use")).toContainText("हिंदी अनुवाद AI से बनाया गया");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("Your flight: a trip gets its cruise checked and a shareable link", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/flight");
  // the default trip (or a "no forecast" message when the outlook is missing) appears by itself
  await expect(page.locator(".fp-out, .page.flight .muted.mono").first()).toBeVisible();
  if (await page.locator(".fp-out").count()) {
    await expect(page.locator(".fp-out")).toContainText("cruise");
    await expect(page).toHaveURL(/from=BLR&to=DEL/);
    await page.getByRole("button", { name: /contrail-prone/ }).click();
    await expect(page.locator(".fp-scan")).not.toContainText("Scanning");
  }
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("Report card: a scored day, or a clear message before the first one", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/report");
  await expect(page.locator(".rc-day, .page.report .muted.mono").first()).toBeVisible();
  if (await page.locator(".rc-day").count()) await expect(page.locator(".rc-tiles").first()).toContainText("chance");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("Make a contrail: the sliders change the verdict, by the same physics as the model", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/sandbox");
  await page.getByRole("button", { name: "Winter night, humid layer" }).click();
  await expect(page.locator(".sb-verdict")).toContainText("lasting");
  await page.getByRole("button", { name: "Warm summer afternoon" }).click();
  await expect(page.locator(".sb-verdict")).toContainText("No contrail");
  await page.getByRole("button", { name: "Cold but dry" }).click();
  await expect(page.locator(".sb-verdict")).toContainText("short");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("What if we'd listened: one real day replays, with the published D-006 totals", async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" }); // starts paused
  await page.goto("/replay?day=2026-02-01");
  await expect(page.locator(".rp-canvas")).toHaveCount(2);
  await expect(page.locator(".rp-sum")).toContainText("56 climbs or descents");
  await expect(page.locator(".rp-sum")).toContainText("2,644 t");
  await page.getByLabel("Time of day (UTC)").fill("1440");
  await expect(page.locator(".rp-clock")).toContainText("00:00 UTC");
  await page.getByRole("tab", { name: /1 Apr 2025/ }).click();
  await expect(page.locator(".rp-sum")).toContainText("44 climbs or descents");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("For airlines: the rule's dates and a cost in rupees that follows the inputs", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/airlines");
  await expect(page.locator(".al-time")).toContainText("2027");
  const cost = page.locator(".al-tiles > div").nth(1).locator("b");
  await expect(cost).toContainText("₹");
  const before = await cost.textContent();
  await page.getByLabel("Jet fuel, ₹ per litre").fill("274");
  await expect(cost).not.toHaveText(before ?? "");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("the map says what it shows: proof (past days) or forecast", async ({ page }) => {
  await page.goto("/map");
  await expect(page.locator(".mp-mode a.on")).toHaveText(/Proof/i);
  await expect(page.locator(".mp-bar .warn")).toContainText("checked against the satellite");
});

test("Live advice: real-looking feeds give advice for a plane in the air and an expected flight", async ({ page }) => {
  // every outside source is replaced: a made-up sky with lasting-contrail air only at FL360,
  // between 74°E and 76°E, all day; one IndiGo flight cruising there now, one expected
  const errors = collectErrors(page);
  const now = Date.now();
  const day = (d: number) => new Date(now + d * 86_400_000).toISOString().slice(0, 10);
  const DEL = ["DEL", 28.5556, 77.0952];
  const BOM = ["BOM", 19.0887, 72.8679];
  const grid = { lat_north: 37, lat_south: 6, lon_west: 68, lon_east: 98, rows: 125, cols: 121, step_deg: 0.25, encoding: "png_uint8_hour_sprite" };
  const manifest = {
    contract_version: "2.0.0", build_id: "outlook", created_at: "x", git_commit: "x", config_hash: "x", pipeline_version: "x", model_version: "test",
    days: [day(0), day(1)], days_with_flights: [], flight_levels: [280, 300, 320, 340, 360, 380, 400, 420].map((fl) => ({ fl, pressure_hpa: 250 })),
    hours_utc: Array.from({ length: 24 }, (_, h) => h), grid, eta_for_grids: 0.3, coverage: { adsb_coverage_pct: null, note: "test" }, credits: ["test"],
    layers: [{ id: "B1", file: "layers/B1_FL{fl}.png", per_flight_level: true, full_scale: 1, meaning: "test" }],
  };
  const outlook = { run: `${day(0)}T00:00Z`, issued: "x", days: manifest.days, credit: "test", threshold: 0.5, note: "test", advisories: [] };
  await page.route("**/data/outlook/manifest.json", (r) => r.fulfill({ json: manifest }));
  await page.route("**/data/outlook/outlook.json", (r) => r.fulfill({ json: outlook }));
  await page.route(/\/data\/outlook\/days\/.*B1_FL(\d+)\.png$/, (r) => r.fulfill({ contentType: "image/png", body: sprite(grid, /FL360/.test(r.request().url())) }));
  await page.route("**/api/live**", (r) =>
    r.fulfill({ json: { t: now, centre: [20.5, 79], radius_nm: 250, credit: "test", snapshot_age_min: 1, ac: [{ cs: "IGO5001", type: "A20N", alt: 36000, lat: 23.8, lon: 75.9, trk: 215, gs: 450, t: now, vs: 0, route: [DEL, BOM] }] } }),
  );
  const dep = new Date(now + 2 * 3_600_000);
  await page.route("**/data/schedule/schedule.json", (r) =>
    r.fulfill({ json: { day: day(-1), built: "x", source: "test", n_records: 1, flights: [{ cs: "IGO5002", type: "A21N", from: DEL, to: BOM, dep: dep.getUTCHours() * 60 + dep.getUTCMinutes(), acc: 10, block: 125 }] } }),
  );

  await page.goto("/now");
  const board = page.locator(".now-table");
  await expect(board).toContainText("IGO5001");
  await expect(board.locator("tr.best")).toContainText("DEL → BOM");
  await expect(board.locator("tr.best")).toContainText("→ FL");
  await expect(page.locator(".now-alerts b")).toHaveText("1");
  await board.getByRole("button", { name: "IGO5001" }).click();
  const card = page.locator(".now-detail");
  await expect(card).toContainText("Advice:");
  await expect(card).toContainText("Delhi (DEL) → Mumbai (BOM)"); // cities from the site's airport list
  await expect(card.locator("dt")).toContainText(["Route", "Departed", "Lands", "Travel time", "Level", "Contrails"]);
  await expect(card).toContainText("could last until about");
  // near me: Bengaluru is far from this plane, so the board empties; all of India brings it back
  await page.getByLabel("Near").selectOption("Bengaluru");
  await expect(page.locator(".now-board")).not.toContainText("IGO5001");
  await page.getByLabel("Near").selectOption("all");
  await expect(board).toContainText("IGO5001");

  await page.getByRole("tab", { name: "Next 12 hours" }).click();
  await expect(board).toContainText("IGO5002");
  await expect(board.locator("tr.best")).toContainText("FL360"); // the level IGO5001 flies on the same route now
  await board.getByRole("button", { name: "IGO5002" }).click();
  await expect(card).toContainText("as airliners on this route fly now");
  await expect(card).toContainText("Departs");

  // the live feed goes down: the recorded sky is shown, and says so
  await page.unroute("**/api/live**");
  await page.route("**/api/live**", (r) =>
    r.fulfill({
      json: {
        t: now, centre: [20.5, 79], radius_nm: 250, credit: "test", snapshot_t: now - 8 * 3_600_000, snapshot_age_min: 0,
        fallback: { recorded_t: now - 8 * 3_600_000, reason: "thin", live_count: 16 },
        ac: [{ cs: "IGO5001", type: "A20N", alt: 36000, lat: 23.8, lon: 75.9, trk: 215, gs: 450, t: now, vs: 0, route: [DEL, BOM] }],
      },
    }),
  );
  await page.goto("/now");
  await expect(page.locator(".now-recorded")).toContainText("The live feed is down.");
  await expect(page.locator(".now-recorded")).toContainText("only 16 airliners");
  await expect(board).toContainText("IGO5001");
  expect(errors, errors.join("\n")).toHaveLength(0);
});

/** A B1 hour sprite (rows × 24 hours of cols, 8-bit grey PNG): lasting air between 74°E and 76°E, or none. */
function sprite(g: { rows: number; cols: number; lon_west: number; step_deg: number }, humid: boolean): Buffer {
  const w = g.cols * 24;
  const raw = Buffer.alloc((w + 1) * g.rows);
  for (let r = 0; r < g.rows; r++)
    for (let h = 0; h < 24; h++)
      for (let c = 0; c < g.cols; c++) {
        const lon = g.lon_west + c * g.step_deg;
        raw[r * (w + 1) + 1 + h * g.cols + c] = humid && lon >= 74 && lon <= 76 ? 255 : 0;
      }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(g.rows, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
