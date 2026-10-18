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

test("map: ranked segments, lower detail bar with contrail lifetime, flights, controls", async ({ page }) => {
  test.setTimeout(240_000); // software WebGL on CI runners is several times slower than a laptop
  const errors = collectErrors(page);
  await openMap(page);
  await expect(page.locator(".strip")).toHaveCount(66); // 1 Jan 2026: 66 flagged segments (B1)

  // a ranked segment opens the lower bar with "contrail lasted"
  await page.locator(".strip").first().click();
  await expect(page.locator(".life-num")).toBeVisible();
  await expect(page.locator(".dk-flight b")).not.toBeEmpty();
  await expect.poll(() => page.url()).toContain("seg=");
  const nav1 = await page.locator(".sc-nav .mono").textContent();
  await page.locator('.sc-nav button[aria-label^="Next"]').click();
  await expect(page.locator(".sc-nav .mono")).not.toHaveText(nav1 ?? "");
  await page.locator(".dk-end .tool").click();
  await expect(page.locator(".deck")).toHaveCount(0);

  // a flight with no flagged segment: flight details + the sky column
  await mapStill(page);
  const pt = await featurePoint(page, "legs", ["flagged", "planes"]);
  expect(pt, "an unflagged track on screen").not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  await expect(page.locator(".deck")).toBeVisible();
  await expect(page.locator(".sky-col")).toBeVisible();
  await page.locator(".dk-end .tool").click();

  // a flagged segment on the map shows a non-zero lifetime
  await mapStill(page);
  const fp = await featurePoint(page, "flagged", []);
  expect(fp, "a flagged segment on screen").not.toBeNull();
  await page.mouse.click(fp!.x, fp!.y);
  await expect(page.locator(".life-num")).toBeVisible();
  await expect(page.locator(".life-num")).not.toHaveText("0 h");

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
  await page.locator(".theme-btn").click();
  await page.locator(".date-pick select").selectOption("2026-01-15");
  await expect(page.locator(".empty")).toBeVisible();
  await page.locator(".empty .tool").click();
  await expect(page.locator(".strip")).toHaveCount(66);

  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("every page renders without errors", async ({ page }) => {
  const errors = collectErrors(page);
  for (const path of ["/", "/how-it-works", "/progress", "/methods", "/team", "/about-data", "/contact"]) {
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
  await page.locator('header a[href="/methods"]').first().click();
  await expect(page.locator("h1")).toContainText("before results", { timeout: 15_000 });
  expect(page.url()).toContain("/methods");
  expect(blocked).toBeGreaterThanOrEqual(2);
});
