// risk: plan.md Phase 8 (competition-results-core) — the results grid's decimal
// score input (unlike the training grid's checkbox) triggers mobile
// WebKit/Blink's zoom-into-view heuristic, or the new right-sticky average
// column (the first right-sticky column in this codebase) doesn't stay
// pinned during horizontal scroll of the table's own scroll container —
// breaking the field-use mobile quality bar. Extends mobile-grid.spec.ts's
// template (Risk #1 in test-plan.md) with this page's specific risks.
// seed: tests/e2e/seed.spec.ts
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SEED_PATH = path.join("playwright", ".auth", "seed.json");
const SCALE_TOLERANCE = 0.05;
const COMPETITION_COUNT = 5; // enough date columns to overflow a 393px-wide mobile viewport
// exercises.name (Class 1's first exercise, fixed rulebook reference data —
// see 20260903000001_create_competition_reference_data.sql). ScoreCell.tsx's
// aria-label always uses this full name, regardless of viewport.
const EXERCISE_NAME = "Sitting in a group";
// exercises.shortcut for the same exercise. On this mobile-chrome project
// (< Tailwind's `sm` breakpoint), CompetitionResultsGrid.tsx hides the full
// name behind `hidden sm:inline` and shows only the shortcut, so this is the
// row header's actual accessible name here — not EXERCISE_NAME.
const EXERCISE_SHORTCUT = "Group";

function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

test("competition results grid stays at full mobile scale, keeps its sticky average column pinned during horizontal scroll, and recalculates the average on score entry", async ({
  page,
}) => {
  const { dogId } = JSON.parse(await readFile(SEED_PATH, "utf-8")) as { dogId: string };

  await page.goto(`/dogs/${dogId}/competition-results`);

  // Wait for the island to hydrate before interacting — the "Add competition"
  // button is present in the server-rendered HTML pre-hydration too (Astro's
  // client:load SSRs the initial markup), so a plain visibility wait would
  // race React's hydration pass and click a not-yet-wired-up handler. The
  // "All time" window button is `disabled={!mounted}` in
  // CompetitionResultsGrid.tsx, so it flips enabled at the exact hydration
  // commit that also wires up every other handler in this same component
  // tree. A generous explicit timeout (well past expect()'s 5s default,
  // matching the ~30s a plain .click() gets from Playwright's action
  // timeout) — under concurrent test-worker load, Vite's dev-mode first
  // compile of this island's chunk can take longer than 5s.
  await expect(page.getByRole("button", { name: "All time" })).toBeEnabled({ timeout: 15000 });

  // Setup: add COMPETITION_COUNT competitions (Class 1 is this page's
  // default) via the real dialog — enough date columns to force the results
  // table to overflow its scroll container on a 393px mobile viewport.
  const competedOnDates = Array.from({ length: COMPETITION_COUNT }, (_, i) => isoDaysAgo(i));
  for (const competedOn of competedOnDates) {
    await page.getByRole("button", { name: "Add competition" }).click();
    const dateInput = page.getByLabel("Competition date");
    await dateInput.fill(competedOn);

    // Assertion: filling the dialog's date input doesn't trigger mobile
    // zoom-into-view — the other text-style input besides the score cells
    // per plan.md's Phase 8 contract.
    const scaleAfterDateInput = await page.evaluate(() => window.visualViewport?.scale);
    expect(scaleAfterDateInput).toBeGreaterThan(1 - SCALE_TOLERANCE);
    expect(scaleAfterDateInput).toBeLessThan(1 + SCALE_TOLERANCE);

    // Wait for the actual POST to resolve before asserting the dialog
    // closes — under concurrent test-worker load the request can take
    // longer than a default assertion timeout, so this waits for the real
    // state change (the response) rather than padding a timeout.
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes(`/api/dog/${dogId}/competitions`) && res.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Save" }).click(),
    ]);
    expect(response.ok()).toBe(true);
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();

  const exerciseRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: EXERCISE_SHORTCUT, exact: true }) });
  const averageCell = exerciseRow.getByRole("gridcell").last();
  await expect(averageCell).toHaveText("—");

  const scoreCell = page.getByRole("textbox", { name: `${EXERCISE_NAME}, ${competedOnDates[0]}` });

  // Assertion: tapping a score cell doesn't trigger the zoom-into-view quirk
  // ScoreCell.tsx's tap-target-safe sizing guards against (mirrors
  // mobile-grid.spec.ts's TickCell check, adapted for a text input).
  await scoreCell.click();
  const scaleAfterTap = await page.evaluate(() => window.visualViewport?.scale);
  expect(scaleAfterTap).toBeGreaterThan(1 - SCALE_TOLERANCE);
  expect(scaleAfterTap).toBeLessThan(1 + SCALE_TOLERANCE);

  try {
    // Action: enter a score and blur — the average cell should recalculate
    // immediately from this single entered score (CompetitionBoard.averages()).
    await scoreCell.fill("8.5");
    await scoreCell.blur();
    await expect(averageCell).toHaveText("8.50");

    // Assertion: no page-level horizontal overflow (mirrors mobile-grid.spec.ts's
    // document.body.scrollWidth check — not documentElement's, since Chromium
    // clamps documentElement.scrollWidth once `html` has overflow-x: hidden).
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(Math.abs(scrollWidth - clientWidth)).toBeLessThanOrEqual(1);

    // Assertion: the sticky-right average column header stays pinned to the
    // same viewport offset before and after horizontally scrolling the
    // results table's own scroll container (not the page) — plan.md's Phase
    // 7 sticky z-index contract for the new top+right-sticky corner cell.
    const scrollContainer = page.getByTestId("competition-results-scroll");
    const avgHeader = page.getByRole("columnheader", { name: "Avg" });
    const rectBefore = await avgHeader.evaluate((el) => el.getBoundingClientRect().right);

    await scrollContainer.evaluate((el) => {
      el.scrollTo({ left: el.scrollWidth });
    });
    await expect.poll(async () => scrollContainer.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

    const rectAfter = await avgHeader.evaluate((el) => el.getBoundingClientRect().right);
    expect(Math.abs(rectAfter - rectBefore)).toBeLessThanOrEqual(1);
  } finally {
    // Cleanup: clear the entered score back to unscored. The added
    // competitions themselves can't be removed — no delete UI exists for this
    // slice (plan.md "What We're NOT Doing"; S-07 is the fast-follow) — they
    // are cascaded away when global-teardown deletes this run's test user,
    // mirroring seedDog/seedElement's whole-run lifetime.
    await scoreCell.fill("");
    await scoreCell.blur();
    await expect(averageCell).toHaveText("—");
  }
});
