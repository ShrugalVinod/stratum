import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageZip } from "./fixture";

test("label a scene: draw a polyline, set status, export valid JSON", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "labeller-"));
  const pkg = join(dir, "pilot.zip");
  writeFileSync(pkg, packageZip());

  await page.goto("/");
  await page.getByPlaceholder("aditya, ishaan or abeer").fill("Aditya");
  await page.getByTestId("pkg").setInputFiles(pkg);
  await page.getByRole("button", { name: "Start" }).click();
  const sid = await page.getByTestId("scene-id").textContent();
  expect(sid).toMatch(/^S00[12]$/);

  await page.waitForTimeout(300); // let the viewer size itself
  const box = (await page.locator(".viewer").boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // a too-short line is refused (rule 1)
  await page.mouse.click(cx, cy);
  await page.mouse.dblclick(cx + 4, cy);
  await expect(page.getByRole("status")).toContainText("Too short");
  await page.keyboard.press("Escape");
  // clicks outside the image are ignored
  await page.mouse.click(box.x + 3, box.y + 3);
  await expect(page.locator(".hint")).not.toContainText("Drawing:");
  // a proper line: three clicks along the bright line, double-click to finish
  await page.mouse.click(cx - 150, cy - 45);
  await page.mouse.click(cx, cy);
  await page.mouse.dblclick(cx + 150, cy + 45);
  await expect(page.locator("ol.lines li")).toHaveCount(1);
  await page.getByLabel("Clear").check();
  await expect(page.getByText("Scene complete")).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
  const out = join(dir, "export.zip");
  await dl.saveAs(out);
  const files = unzipSync(new Uint8Array(readFileSync(out)));
  const j = JSON.parse(strFromU8(files[`aditya/${sid}.json`]));
  expect(j).toMatchObject({ scene_id: sid, labeller: "aditya", scene_status: "clear", app_version: "1.0.0" });
  expect(j.objects).toHaveLength(1);
  const pts: [number, number][] = j.objects[0].polyline_px;
  expect(pts.length).toBeGreaterThanOrEqual(3);
  for (const [r, c] of pts) {
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(256);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(256);
  }
  expect(j.objects[0].confidence).toBe("sure");
  expect(JSON.parse(strFromU8(files["aditya/_export.json"])).complete).toBe(1);

  // work survives a reload (autosave), and the next scene opens
  await page.reload();
  await page.getByPlaceholder("aditya, ishaan or abeer").fill("aditya");
  await page.getByTestId("pkg").setInputFiles(pkg);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("scene-id")).not.toHaveText(sid!); // opens the first unfinished scene
});
