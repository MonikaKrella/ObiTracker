// Seed exemplar for this project's E2E suite (.claude/skills/10x-e2e/references/seed-test-pattern.md).
// Every generated test is modeled on this one — role-based locators, one
// self-contained setup/action/assertion/cleanup block, wait-for-state, a
// risk-tied name. Authenticates via the `mobile-chrome` project's
// storageState (tests/e2e/global-setup.ts) and reuses the dog seeded there.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SEED_PATH = path.join("playwright", ".auth", "seed.json");

test("training element created via dialog persists after page reload", async ({ page }) => {
  const { dogId } = JSON.parse(await readFile(SEED_PATH, "utf-8")) as { dogId: string };
  const elementName = `Seed Element ${Date.now()}`;

  await page.goto(`/dogs/${dogId}/elements`);

  await page.getByRole("button", { name: "Add element" }).click();
  await page.getByLabel("Element name").fill(elementName);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(elementName, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(elementName, { exact: true })).toBeVisible();

  // Cleanup
  await page.getByRole("button", { name: `Delete ${elementName}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: `Delete ${elementName}` })).toBeHidden();
});
