// End-to-end checks of the STRATUM website (Phase 4 open item a; port of the 19 local checks).
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
  for (const path of ["/", "/how-it-works", "/progress", "/results", "/methods", "/team", "/about-data", "/contact", "/game", "/3d"]) {
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
