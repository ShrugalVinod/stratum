import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageZip } from "./fixture";

test("review mode (D-003): Claude's draft lines are pre-loaded, the reviewer confirms and exports", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "labeller-review-"));
  const pkg = join(dir, "test.zip");
  writeFileSync(pkg, packageZip());
  const draft = {
    scene_id: "S001", labeller: "claude-draft", app_version: "draft-1", package_version: "1.0", scene_status: "clear",
    flags: { no_contrails: false, unusable: false, unusable_reason: "" },
    objects: [{ id: "c0", polyline_px: [[113, 80], [143, 180]], confidence: "sure" }],
    started_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", time_spent_s: 0,
  };
  const draftZip = join(dir, "claude-draft.zip");
  writeFileSync(draftZip, zipSync({ "claude-draft/S001.json": strToU8(JSON.stringify(draft)) }));

  await page.goto("/");
  await page.getByRole("tab", { name: "Review" }).click();
  await page.getByPlaceholder("aditya, ishaan or abeer").fill("aditya");
  await page.getByTestId("pkg").setInputFiles(pkg);
  await page.getByTestId("draft").setInputFiles(draftZip);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByTestId("scene-id")).toHaveText("S001"); // aditya reviews S001 of S001/S002
  await expect(page.locator("ol.lines li")).toHaveCount(1);
  await expect(page.locator("ol.lines li")).toContainText("claude-draft");
  // the scene is not done until the reviewer sets the status
  await expect(page.getByText("Scene complete")).toHaveCount(0);
  await page.getByLabel("Clear").check();
  await expect(page.getByText("Scene complete")).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export").click()]);
  const out = join(dir, "export.zip");
  await dl.saveAs(out);
  const files = unzipSync(new Uint8Array(readFileSync(out)));
  const j = JSON.parse(strFromU8(files["aditya-review/S001.json"]));
  expect(j).toMatchObject({ scene_id: "S001", labeller: "aditya-review", scene_status: "clear" });
  expect(j.objects).toHaveLength(1);
  expect(j.objects[0].source).toBe("claude-draft");
});
