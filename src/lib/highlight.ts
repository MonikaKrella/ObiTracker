import type { TrainingElement } from "@/types";

/**
 * Computes green/red highlights for training elements based on tick counts.
 *
 * Business rule (FR-007 + clarifications 2026-06-17, 2026-06-18):
 *
 * TIER 1 — n ≤ 3 (too few elements for any signal):
 *   - No highlights at all. Every element resolves to null.
 *
 * TIER 2 — 4 ≤ n ≤ 6 (single-winner only, no tie expansion):
 *   - GREEN: the single element with the highest tick count, but ONLY when
 *     that count is unique (no tie at rank 1). A tie at the top means no
 *     green highlight at all — not an expanded set.
 *   - RED: the single element with the lowest tick count, but ONLY when
 *     that count is unique (no tie at the last rank). A tie at the bottom
 *     means no red highlight at all.
 *   - No rank-2/3, no tie expansion, no suppression check — deliberately
 *     simpler than Tier 3; with this few elements a top/bottom-3 set would
 *     always cover half or more anyway.
 *
 * TIER 3 — n ≥ 7 (full top-3 / bottom-3 algorithm):
 *   - GREEN: rank elements by tick count DESC. Rank-1 tie: ALL tied elements
 *     get green (tie expansion). Rank 2 and 3: one element each, no tie
 *     expansion.
 *   - RED: rank elements by tick count ASC. Rank-last tie: ALL tied elements
 *     get red (tie expansion). Ranks 2-from-last and 3-from-last: one
 *     element each, no tie expansion.
 *   - SUPPRESSION (post-build, each colour independently): if the resulting
 *     set covers AT LEAST half of all elements (set.size * 2 >= n), suppress
 *     that colour entirely. In practice this only fires when a rank-1 tie
 *     group is large (e.g. a 4-way tie at n=8) — without a rank-1 tie the
 *     set is capped at size 3, which never reaches half once n ≥ 7.
 *
 * - Green takes precedence over red when an element qualifies for both.
 * - `tickCounts` MUST include ALL elements (default 0 for untrained ones) —
 *   elements absent from the map are invisible to the algorithm.
 *
 * @param elements  - all TrainingElement rows for the dog, in display order
 * @param tickCounts - Map<elementId, count>; every element must have an entry
 * @returns Map<elementId, 'green' | 'red' | null>
 */
export function computeHighlights(
  elements: TrainingElement[],
  tickCounts: Map<string, number>,
): Map<string, "green" | "red" | null> {
  const result = new Map<string, "green" | "red" | null>(elements.map((e) => [e.id, null] as const));

  const n = elements.length;
  if (n === 0) return result;

  // ── TIER 1: n ≤ 3 — never meaningful, no highlights. ──
  if (n <= 3) return result;

  const byDesc = [...tickCounts.entries()].sort((a, b) => b[1] - a[1]);
  const byAsc = [...tickCounts.entries()].sort((a, b) => a[1] - b[1]);

  // ── TIER 2: 4 ≤ n ≤ 6 — single winner only, no ties, no expansion. ──
  if (n <= 6) {
    const topIsUnique = byDesc[0][1] !== byDesc[1][1];
    if (topIsUnique) result.set(byDesc[0][0], "green");

    const bottomIsUnique = byAsc[0][1] !== byAsc[1][1];
    if (bottomIsUnique) result.set(byAsc[0][0], "red");

    return result;
  }

  // ── TIER 3: n ≥ 7 — full top-3 / bottom-3 with tie expansion + suppression. ──
  const greenSet = new Set<string>();
  {
    const highestCount = byDesc[0][1];
    let g = 0;
    // Rank 1: all tied elements get green.
    for (const [id, count] of byDesc) {
      if (count === highestCount) {
        greenSet.add(id);
        g++;
      } else break;
    }
    // Rank 2: one element, no tie expansion.
    if (g < 3 && g < n) {
      greenSet.add(byDesc[g][0]);
      g++;
    }
    // Rank 3: one element, no tie expansion.
    if (g < 3 && g < n) {
      greenSet.add(byDesc[g][0]);
    }

    // Suppression: green set covers half or more of the elements → clear it.
    if (greenSet.size * 2 >= n) greenSet.clear();
  }

  const redSet = new Set<string>();
  {
    const lowestCount = byAsc[0][1];
    let r = 0;
    // Rank-last: all tied elements get red.
    for (const [id, count] of byAsc) {
      if (count === lowestCount) {
        redSet.add(id);
        r++;
      } else break;
    }
    // Rank 2-from-last: one element, no tie expansion.
    if (r < 3 && r < n) {
      redSet.add(byAsc[r][0]);
      r++;
    }
    // Rank 3-from-last: one element, no tie expansion.
    if (r < 3 && r < n) {
      redSet.add(byAsc[r][0]);
    }

    // Suppression: red set covers half or more of the elements → clear it.
    if (redSet.size * 2 >= n) redSet.clear();
  }

  // Apply: green takes precedence over red.
  for (const id of redSet) result.set(id, "red");
  for (const id of greenSet) result.set(id, "green"); // overwrites red if overlap

  return result;
}
