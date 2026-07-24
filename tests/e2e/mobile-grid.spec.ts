// risk: test-plan.md #1 — a desktop-targeted CSS/layout change silently
// collapses the mobile grid (observed: rendered at ~10% of viewport width),
// making field use impossible. Historical signature of the failure class:
// window.visualViewport.scale collapsing toward 0 (measured ~0.25 in the
// real incident) instead of staying at 1.
// seed: tests/e2e/seed.spec.ts
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SEED_PATH = path.join("playwright", ".auth", "seed.json");
const SCALE_TOLERANCE = 0.05;

test("training grid renders at full mobile width and stays usable after a tap", async ({ page }) => {
  const { dogId } = JSON.parse(await readFile(SEED_PATH, "utf-8")) as { dogId: string };

  await page.goto(`/dogs/${dogId}/grid`);
  await expect(page.getByRole("grid")).toBeVisible();

  // Assertion 1: the page isn't shrink-to-fit collapsed on initial load.
  const scaleOnLoad = await page.evaluate(() => window.visualViewport?.scale);
  expect(scaleOnLoad).toBeGreaterThan(1 - SCALE_TOLERANCE);
  expect(scaleOnLoad).toBeLessThan(1 + SCALE_TOLERANCE);

  // Assertion 2: no page-level horizontal overflow. `document.body.scrollWidth`
  // is used, not `documentElement.scrollWidth` — Layout.astro's `overflow-x:
  // hidden` is set on both `html` and `body`, and Chromium clamps
  // `documentElement.scrollWidth` to its own clientWidth once `html` itself
  // has `overflow-x: hidden`, silently hiding an overflow regression from that
  // property. `document.body.scrollWidth` still reports the unclamped content
  // extent, so it's the one that actually reveals a regression here.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(Math.abs(scrollWidth - clientWidth)).toBeLessThanOrEqual(1);

  // Assertion 3 + 4: tapping a tick cell (today's column, the last one per
  // generateDateRange's ascending order) both toggles correctly and doesn't
  // trigger the tap-triggered zoom quirk the full-size hitbox fix guards against.
  const todayCell = page.getByRole("grid").getByRole("checkbox").last();
  const wasChecked = await todayCell.isChecked();
  await todayCell.click();
  await expect(todayCell).toBeChecked({ checked: !wasChecked });

  const scaleAfterTap = await page.evaluate(() => window.visualViewport?.scale);
  expect(scaleAfterTap).toBeGreaterThan(1 - SCALE_TOLERANCE);
  expect(scaleAfterTap).toBeLessThan(1 + SCALE_TOLERANCE);

  // Cleanup: restore the cell's original state — no per-test DB teardown
  // exists for this seeded element (see plan.md's Critical Implementation
  // Details), so the test must leave the row exactly as it found it.
  await todayCell.click();
  await expect(todayCell).toBeChecked({ checked: wasChecked });
});
