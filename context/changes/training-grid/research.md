---
date: 2026-06-17T00:00:00Z
researcher: Claude Sonnet 4.6
git_commit: b8ec710a3d3daafa54b8643899678ebb141443e4
branch: training-elements
repository: obitracker
topic: "Training grid — best solutions for grid rendering, tick interaction, highlight algorithm, DB query strategy"
tags: [research, codebase, training-grid, react-island, supabase, tailwind4, accessibility]
status: complete
last_updated: 2026-06-18
last_updated_by: Claude Sonnet 4.6
last_updated_note: "Tightened computeHighlights suppression threshold to >= half; introduced 3 tiers — n≤3 no highlights, 4≤n≤6 single-winner only (no ties), n≥7 full top-3/bottom-3 algorithm"
---

# Research: Training Grid — Implementation Best Solutions

**Date**: 2026-06-17  
**Researcher**: Claude Sonnet 4.6  
**Git Commit**: b8ec710a3d3daafa54b8643899678ebb141443e4  
**Branch**: training-elements  
**Repository**: obitracker  

---

## Research Question

What are the best solutions for implementing the ObiTracker training grid (S-04)?  
Focus areas: grid rendering approach (Tailwind 4, bi-directional scroll, mobile-first), and React island tick interaction (optimistic updates, loading states, state shape).

---

## Summary

The training grid is the product's north star — one glance must tell the handler what to train next. Four key decisions drive the entire implementation:

1. **Use `<table>` with `position: sticky`** for the bi-directional scrolling grid with sticky first column. HTML `<table>` gives free semantic ARIA grid roles, native sticky column support, and aligns with the existing Tailwind 4 utility-class patterns already used throughout the project.

2. **Optimistic updates with `useOptimistic` (React 19) + debounced fetch** for tick cells. The handler is standing on a field — latency cannot block the UI. A 300ms debounce on the API call handles accidental double-taps cleanly; `useOptimistic` auto-reverts the cell if the API call fails.

3. **Client-side highlight recalculation** using a pure `computeHighlights` function. All tick data for the window is loaded once at SSR; every tap re-runs the pure function with no server round-trip.

4. **Two-query SSR pattern** (`getTrainingElements` + `getTrainingLogs`) following the existing service layer convention. A single toggle API endpoint (`POST /api/dog/[id]/logs`) handles both INSERT and DELETE atomically using the UNIQUE constraint.

---

## Detailed Findings

### 1. Grid Rendering: `<table>` with Tailwind 4 sticky utilities

**Decision: `<table>` — not CSS Grid, not flexbox**

| Approach | Sticky column | Alignment | ARIA semantics | Mobile scroll | Verdict |
|----------|---|---|---|---|---|
| `<table>` | `sticky left-0` on `<td>` | Native | `role="grid"` for free | `overflow-x-auto` wrapper | ✅ Recommended |
| CSS Grid | Requires `position: sticky` on each cell + JS-computed column widths | Explicit | Manual ARIA | Same wrapper | ⚠️ Viable but complex |
| Flexbox | No clean sticky column | Manual alignment | Manual ARIA | Same | ❌ Not recommended |

**Why table:** `position: sticky; left: 0` works directly on `<td>` and `<th>` — critically **not on `<tr>`, `<tbody>`, or `<table>`**. The column count for date headers is known at SSR time (7/14/30 days), so `table-layout: fixed` with explicit `min-w-[...]` per column is appropriate. CSS Grid's `grid-template-columns: repeat(N, ...)` would also work but adds no benefit over table for a regular 2D date-matrix.

**`overflow-y: clip` trick for two-axis sticky (modern CSS, June 2026):**

The long-standing problem: wrapping with `overflow-x: auto` and `overflow-y: auto` breaks `position: sticky; top: 0` on `<thead>` because it sticks to the wrapper, not the page. The modern fix (broad support, Safari 16+):

```css
.grid-wrapper {
  overflow-x: auto;
  overflow-y: clip;   /* horizontal scroll only — sticky top tracks the document */
}
```

`overflow-y: clip` prevents a vertical scroller from being created; sticky headers walk up to the document anchor. The sticky first column (`left: 0`) still sticks to the wrapper's horizontal scroll. Two independent sticky anchors, zero JS.

**iOS Safari critical requirements:**
- `transform: translateZ(0)` on sticky cells — forces GPU compositing, eliminates jitter on fast iOS scroll
- `touch-action: manipulation` on tap targets — eliminates the 300ms iOS double-tap delay
- Explicit `background-color` on all sticky cells — transparent stickies show scroll-through bleed

**Tailwind 4 setup in this project:** `src/styles/global.css` uses `@import "tailwindcss"` (v4 syntax), custom theme variables via `@theme inline`, and custom utilities via `@utility`. All standard sticky/overflow/z-index utilities are available. No `@apply` needed for the grid.

**Z-index stacking for sticky header + column:**

| Element | Classes | z-index |
|---------|---------|---------|
| Header corner (top-left, both sticky) | `sticky left-0 top-0 z-30` | 30 |
| Header row (date columns, sticky top) | `sticky top-0 z-20` | 20 |
| Name column (element rows, sticky left) | `sticky left-0 z-20` | 20 |
| Normal data cells | — | auto |

**Row highlighting pattern follows `ElementRow.tsx:29-31`:**

```tsx
const rowClasses = cn(
  "border-b border-white/10 hover:bg-white/5 transition-colors",
  isGreen && "bg-emerald-500/15",
  isRed && "bg-rose-500/15",
);
return <tr className={rowClasses}>{/* ... */}</tr>;
```

Use `bg-emerald-500/15` for green and `bg-rose-500/15` for red — both visible on the project's `bg-cosmic` dark background.

---

### 2. Scroll Container Architecture

The existing page wrapper (`src/layouts/AuthLayout.astro:17-18`) uses `max-w-4xl px-4` on all content.

**Recommended grid container (two-axis scroll):**

```html
<div class="overflow-x-auto border border-white/10 rounded-2xl bg-white/5 [overflow-y:clip]">
  <table class="w-full border-collapse table-fixed text-sm">
    <!-- ... -->
  </table>
</div>
```

The grid scrolls **horizontally within this container** and **vertically with the page** (no fixed-height inner div needed — page scroll handles vertical). A fixed-height inner div creates a third scrollable region that confuses iOS users.

**Column widths:**

| Column | Min width | Rationale |
|--------|-----------|-----------|
| Name (sticky) | `min-w-[150px]` or `min-w-[9rem]` | Room for typical element names |
| Day column | `min-w-[2.75rem]` (44px) | WCAG 2.5.5 touch target minimum |
| Today's column | Same but with distinct border | Visual anchor |

On a 375px phone in landscape (667px), 14 columns × 44px + 150px label = 766px — horizontal scroll engaged. On desktop (1440px), 30 columns × 44px + 150px = 1470px — also scrolls slightly inside `max-w-4xl`.

---

### 3. Cell Touch Target & Accessibility

**WCAG 2.5.5 (AAA): 44×44px.** For a field-use app on a phone, this is the practical minimum.

**Pattern: `<label>` wrapping `<input type="checkbox" class="sr-only">`**

This is the most accessible and most robust approach (recommended by Adrian Roselli, W3C APG):

```tsx
<td role="gridcell" className="p-0">
  <label className={cn(
    "flex items-center justify-center min-w-[2.75rem] min-h-[2.75rem]",
    "cursor-pointer select-none touch-action-manipulation",
    "-webkit-tap-highlight-color-transparent"
  )}>
    <input
      type="checkbox"
      checked={optimisticChecked}
      onChange={handleTap}
      className="sr-only"
      aria-label={`${elementName} on ${date}`}
    />
    <span aria-hidden="true" className={cn(
      "w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-colors",
      optimisticChecked
        ? "bg-emerald-500 border-emerald-500"
        : "border-white/30 bg-transparent"
    )}>
      {optimisticChecked && <CheckIcon className="size-3 text-white" />}
    </span>
  </label>
</td>
```

**Why this over `role="checkbox"` + `aria-checked`:**
- Native `<input type="checkbox">` gives correct announcements on all screen readers without managing `aria-checked` manually
- `<label>` wrapper makes the entire cell the tap target (no `e.stopPropagation()` needed)
- Compatible with `useOptimistic` via the `checked` prop and `onChange` handler
- Keyboard: Tab to the checkbox, Space to toggle — zero custom keyboard handling

**Table-level ARIA:**
```html
<table role="grid" aria-label="Training log for {dogName}">
```

`role="grid"` on `<table>` signals to assistive tech that the table contains interactive widgets. Combined with `<th scope="col">` for date headers and `<th scope="row">` for element names (as `role="rowheader"`), screen readers announce each cell as "Heelwork, Jun 17, unchecked."

---

### 4. React Island: Optimistic Updates (React 19 `useOptimistic`)

**Decision: Optimistic with `useOptimistic` + `startTransition` + 300ms debounced fetch**

React 19 ships `useOptimistic` as a first-party hook purpose-built for this pattern. The key insight: **`useOptimistic` auto-reverts** when the `startTransition` async call ends without the parent prop updating — no manual rollback needed.

```tsx
// src/components/training-grid/TickCell.tsx
import { useOptimistic, startTransition, useRef } from "react";

interface Props {
  elementId: string;
  elementName: string;
  date: string;            // "YYYY-MM-DD"
  checked: boolean;        // from parent state
  onToggle: (elementId: string, date: string, next: boolean) => Promise<void>;
}

export function TickCell({ elementId, elementName, date, checked, onToggle }: Props) {
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(
    checked,
    (_prev, next: boolean) => next,
  );

  const abortRef = useRef<AbortController | null>(null);

  function handleChange() {
    const next = !optimisticChecked;
    // Abort any in-flight request for this cell (rapid tap handling)
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    startTransition(async () => {
      setOptimisticChecked(next);  // immediate visual flip
      try {
        await onToggle(elementId, date, next);  // debounced in parent
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // superseded tap
        // useOptimistic auto-reverts here — parent prop unchanged = revert
        toast.error("Could not save — tap to retry.");
      }
    });
  }

  return (
    <td role="gridcell" className="p-0">
      <label className="flex items-center justify-center min-w-[2.75rem] min-h-[2.75rem] cursor-pointer select-none touch-action-manipulation">
        <input
          type="checkbox"
          checked={optimisticChecked}
          onChange={handleChange}
          className="sr-only"
          aria-label={`${elementName} on ${date}`}
        />
        <span aria-hidden="true" className={cn(
          "w-5 h-5 rounded-sm border-2 flex items-center justify-center transition-colors",
          optimisticChecked ? "bg-emerald-500 border-emerald-500" : "border-white/30 bg-transparent"
        )}>
          {optimisticChecked && <CheckIcon className="size-3 text-white" />}
        </span>
      </label>
    </td>
  );
}
```

**Rapid-tap race condition:** `AbortController` ref per cell + 300ms debounce in parent `onToggle`. On rapid taps, each new tap aborts the previous `fetch`. The debounce ensures only the final state is sent to the server. The `AbortError` catch prevents stale reversions.

**401 handling (matches `AddElementDialog.tsx:43-45` and project `lessons.md`):**

```tsx
async function handleToggleAPI(elementId: string, date: string, next: boolean) {
  const res = await fetch(`/api/dog/${dogId}/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ elementId, trainedOn: date }),
    signal,
  });
  if (res.status === 401) {
    window.location.href = "/auth/signin";
    return;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Failed to save");
  }
}
```

---

### 5. Island State Shape

```typescript
// Props passed from Astro SSR page to the island
interface TrainingGridProps {
  dogId: string;
  elements: TrainingElement[];                          // ordered list
  initialTicks: Array<{ element_id: string; trained_on: string }>; // from getTrainingLogs()
  today: string;                                        // "YYYY-MM-DD" — set server-side
  defaultWindowDays?: 7 | 14 | 30;                      // defaults to 30
}

// Internal state (inside the island, not exposed)
interface TrainingGridInternalState {
  // All ticks loaded from server (unbounded history for window switching)
  allTicks: Array<{ element_id: string; trained_on: string }>;

  // Selected window — changes trigger client-side highlight recalculation
  windowDays: 7 | 14 | 30;

  // Computed highlights — derived state, updated whenever allTicks or windowDays changes
  highlights: Map<string, "green" | "red" | null>;
}
```

**`allTicks` vs. window-scoped ticks:** Load ALL tick history upfront (or at least 30 days — the maximum window). This enables instant client-side window switching without a new API call. At ~10 elements × 30 days, `allTicks` is ~300 rows maximum — negligible JSON size. 

**`highlights` is derived state.** Never store it redundantly — recompute from `allTicks` + `windowDays` + `today` on every relevant change using `useMemo`.

---

### 6. Window Selector: Client-Side Filtering

```tsx
const windowDays = 30; // or from URL param, defaultWindowDays prop
const [selectedWindow, setSelectedWindow] = useState<7 | 14 | 30>(windowDays);

// Filter ticks to the selected window
const windowTicks = useMemo(() => {
  const start = new Date(today);
  start.setDate(start.getDate() - (selectedWindow - 1));
  const startISO = start.toISOString().slice(0, 10);
  return allTicks.filter(t => t.trained_on >= startISO && t.trained_on <= today);
}, [allTicks, selectedWindow, today]);

// Build tick counts per element
const tickCounts = useMemo(() => {
  const map = new Map<string, number>();
  for (const tick of windowTicks) {
    map.set(tick.element_id, (map.get(tick.element_id) ?? 0) + 1);
  }
  return map;
}, [windowTicks]);

// Highlights from tick counts
const highlights = useMemo(() => computeHighlights(elements, tickCounts), [elements, tickCounts]);
```

Window switching is instant — no API call. The `selectedWindow` state change triggers `useMemo` recalculations in the same render cycle.

---

### 7. DB Query Strategy

**Two-query pattern (follows existing service layer convention):**

```typescript
// src/lib/services/training-logs.ts (new file)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingLog } from "@/types";

/**
 * Fetches training log entries for a dog within a date window (inclusive).
 *
 * The RLS policy (account_id = auth.uid()) enforces ownership.
 * The explicit dog_id filter enables use of the composite index
 * training_logs_account_dog_date_idx (account_id, dog_id, trained_on).
 *
 * Returns logs ordered by trained_on ASC. Returns [] when no logs found.
 * Throws on Supabase error.
 */
export async function getTrainingLogs(
  supabase: SupabaseClient,
  dogId: string,
  startDate: string,  // "YYYY-MM-DD"
  endDate: string,    // "YYYY-MM-DD"
): Promise<Pick<TrainingLog, "element_id" | "trained_on">[]> {
  const { data, error } = await supabase
    .from("training_logs")
    .select("element_id, trained_on")
    .eq("dog_id", dogId)
    .gte("trained_on", startDate)
    .lte("trained_on", endDate)
    .order("trained_on", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

**Only `element_id` and `trained_on` are fetched** — `id`, `dog_id`, `account_id` are not needed by the grid render. Minimal payload.

**Date window calculation:**

```typescript
// src/lib/dates.ts (new helper, or inline in the page)

/**
 * Returns the ISO date bounds for a rolling window ending today (inclusive).
 * Accepts `today` as a parameter for SSR determinism and testability.
 */
export function getTrainingWindow(
  windowDays: number,
  today: Date = new Date(),
): { startDate: string; endDate: string } {
  const endDate = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(start.getDate() - (windowDays - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}
```

**Why `.toISOString().slice(0, 10)` is safe:** Cloudflare Workers run in UTC; the Supabase `trained_on` column is a `DATE` stored as UTC-anchored calendar date. Both sides agree on "today = the current UTC calendar date." A handler training at 11pm local may technically be on a different calendar date than UTC — this is an acceptable edge case for a training tracker (same as GitHub's contribution graph behavior).

**In the Astro page:**

```astro
---
const { startDate, endDate } = getTrainingWindow(30); // always fetch 30 days max
const [elements, logs] = await Promise.all([
  getTrainingElements(supabase, selectedDog.id),
  getTrainingLogs(supabase, selectedDog.id, startDate, endDate),
]);
---

<TrainingGrid
  client:load
  dogId={selectedDog.id}
  elements={elements}
  initialTicks={logs}
  today={endDate}
  defaultWindowDays={30}
/>
```

`Promise.all` for parallel fetching — elements and logs are independent queries.

---

### 8. Tick Toggle API Route

**`POST /api/dog/[id]/logs` — single toggle endpoint (INSERT-or-DELETE)**

```typescript
// src/pages/api/dog/[id]/logs/index.ts

import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { getDogById } from "@/lib/services/dogs";

export const prerender = false;

const toggleSchema = z.object({
  elementId: z.string().uuid("Invalid element ID"),
  trainedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)"),
});

/**
 * POST /api/dog/[id]/logs
 *
 * Toggle a training log: if absent, INSERT (tick); if present, DELETE (untick).
 * The UNIQUE(element_id, trained_on) constraint serializes concurrent toggles.
 * Returns { success: true, state: "ticked" | "unticked" }.
 */
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedDogId = z.string().uuid().safeParse(context.params.id);
  if (!parsedDogId.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsedDogId.data;

  const body: unknown = await context.request.json();
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { elementId, trainedOn } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await getDogById(supabase, dogId);
    if (!dog) return Response.json({ error: "Not found" }, { status: 404 });

    // Try INSERT first; if it fails (UNIQUE violation), DELETE instead.
    const { error: insertError } = await supabase.from("training_logs").insert({
      element_id: elementId,
      dog_id: dogId,
      account_id: context.locals.user.id,
      trained_on: trainedOn,
    });

    if (!insertError) {
      return Response.json({ success: true, state: "ticked" });
    }

    // UNIQUE violation (or any other insert failure) → treat as "was ticked, now untick"
    const { error: deleteError } = await supabase
      .from("training_logs")
      .delete()
      .eq("element_id", elementId)
      .eq("dog_id", dogId)
      .eq("trained_on", trainedOn);

    if (deleteError) throw deleteError;
    return Response.json({ success: true, state: "unticked" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message :
      (err as { message?: string }).message ?? "An unexpected error occurred";
    return Response.json({ error: message }, { status: 500 });
  }
};
```

**Why a single toggle endpoint over separate POST/DELETE:**
- **Idempotent:** Two rapid taps → first INSERT succeeds, second INSERT fails UNIQUE → DELETE. Final state: unticked. Correct.
- **Optimistic UI compatible:** Server returns `state: "ticked" | "unticked"`, which the island uses to confirm or correct its optimistic state. No re-fetch of the grid needed.
- **Race-condition safe:** The UNIQUE constraint serializes concurrent writes at the DB level. No app-level locking needed.
- **`account_id` integrity (roadmap-suggestions.md):** `account_id` is always sourced from `context.locals.user.id` — never from the request body. Protects against the cross-account data gap noted in the roadmap.

---

### 9. Highlight Algorithm — Pure Function

```typescript
// src/lib/highlight.ts (new file)

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
 *     get green (tie expansion). Rank 2 and 3: one element each, but ONLY
 *     when that element's count is unique across ALL elements — if its
 *     count is shared by any other element (a tie at that rank), the slot
 *     is skipped rather than arbitrarily picking one of the tied elements.
 *     (Correction 5, 2026-06-20 — see below.)
 *   - RED: rank elements by tick count ASC. Rank-last tie: ALL tied elements
 *     get red (tie expansion). Ranks 2-from-last and 3-from-last: one
 *     element each, same uniqueness guard as green's rank 2/3.
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
  const result = new Map<string, "green" | "red" | null>(
    elements.map(e => [e.id, null] as const),
  );

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
  // Frequency of each count value across ALL elements — guards ranks 2 and 3
  // against arbitrarily picking one element out of a multi-way tie.
  const countFrequency = new Map<number, number>();
  for (const count of tickCounts.values()) {
    countFrequency.set(count, (countFrequency.get(count) ?? 0) + 1);
  }

  const greenSet = new Set<string>();
  {
    const highestCount = byDesc[0][1];
    let g = 0;
    // Rank 1: all tied elements get green.
    for (const [id, count] of byDesc) {
      if (count === highestCount) { greenSet.add(id); g++; } else break;
    }
    // Rank 2: one element, only when its count is unique (not tied).
    if (g < 3 && g < n && countFrequency.get(byDesc[g][1]) === 1) { greenSet.add(byDesc[g][0]); g++; }
    // Rank 3: one element, same uniqueness guard.
    if (g < 3 && g < n && countFrequency.get(byDesc[g][1]) === 1) { greenSet.add(byDesc[g][0]); }

    // Suppression: green set covers half or more of the elements → clear it.
    if (greenSet.size * 2 >= n) greenSet.clear();
  }

  const redSet = new Set<string>();
  {
    const lowestCount = byAsc[0][1];
    let r = 0;
    // Rank-last: all tied elements get red.
    for (const [id, count] of byAsc) {
      if (count === lowestCount) { redSet.add(id); r++; } else break;
    }
    // Rank 2-from-last: one element, only when its count is unique (not tied).
    if (r < 3 && r < n && countFrequency.get(byAsc[r][1]) === 1) { redSet.add(byAsc[r][0]); r++; }
    // Rank 3-from-last: one element, same uniqueness guard.
    if (r < 3 && r < n && countFrequency.get(byAsc[r][1]) === 1) { redSet.add(byAsc[r][0]); }

    // Suppression: red set covers half or more of the elements → clear it.
    if (redSet.size * 2 >= n) redSet.clear();
  }

  // Apply: green takes precedence over red.
  for (const id of redSet)   result.set(id, "red");
  for (const id of greenSet) result.set(id, "green"); // overwrites red if overlap

  return result;
}
```

**Edge case traces — now driven by tier (n ≤ 3 / 4–6 / ≥ 7), not suppression alone:**

| n | Elements / Counts | Tier | Result |
|---|---|---|---|
| 8 | A=5,B=5,C=5,D=5,E=3,F=2,G=1,H=0 | 3 — full algorithm | Green: — (tie set {A,B,C,D}=4, 4×2=8≥8 → suppressed) · Red: H,G,F |
| 6 | A=5,B=4,C=3,D=2,E=1,F=0 | 2 — single winner | Green: A (unique top) · Red: F (unique bottom) |
| 6 | A=5,B=5,C=5,D=1,E=1,F=0 | 2 — single winner | Green: — (3-way tie at top) · Red: F (unique bottom) |
| 5 | A=5,B=5,C=3,D=1,E=0 | 2 — single winner | Green: — (tie at top) · Red: E (unique bottom) |
| 4 | A=5,B=5,C=1,D=1 | 2 — single winner | Green: — (tie at top) · Red: — (tie at bottom) |
| 3 | A=3,B=2,C=1 | 1 — n ≤ 3 | Green: — · Red: — (tier suppresses everything) |
| 5 | A=3,B=3,C=3,D=3,E=0 | 2 — single winner | Green: — (4-way tie at top) · Red: E (unique bottom) |
| 6 | all=0 | 2 — single winner | Green: — (tie at top) · Red: — (tie at bottom) |
| 1 | A=5 | 1 — n ≤ 3 | Green: — · Red: — |

**Practical implication:** the algorithm now has three tiers, driven entirely by `n` (the dog's training-element count):

- **n ≤ 3** — no highlights, ever. Too few elements for the signal to mean anything.
- **4 ≤ n ≤ 6** — at most one green and one red, and only when there's a single clear leader/laggard. Any tie at the top (or bottom) suppresses that colour for that render — there is no fallback to "next distinct rank."
- **n ≥ 7** — the full top-3/bottom-3 algorithm from Tier 3 above, with rank-1 tie expansion and half-or-more suppression.

For a competitive obedience handler with a realistic drill breakdown (often 6-12 elements), the grid will mostly show Tier 2 or Tier 3 behaviour. A handler who has only just started adding elements (≤3) never sees highlights until they add more.

**Important — always initialise `tickCounts` with all elements at count 0:**

Elements with no ticks in the window are not returned by the DB query. They must be present in `tickCounts` with count 0, or they are invisible to both the rank-last calculation and the suppression check.

```typescript
// In the island, before calling computeHighlights:
const tickCounts = useMemo(() => {
  const map = new Map(elements.map(e => [e.id, 0] as const)); // default 0 for all
  for (const tick of windowTicks) {
    map.set(tick.element_id, (map.get(tick.element_id) ?? 0) + 1);
  }
  return map;
}, [elements, windowTicks]);
```

---

### 10. Component Architecture

```
src/components/training-grid/
├── TrainingGrid.tsx          # Main island (client:load) — state, window selector, grid shell
├── TrainingGridRow.tsx       # One element row (<tr>) with sticky name + tick cells
├── TickCell.tsx              # Single tick cell (<td> with useOptimistic)
└── useTrainingGrid.ts        # Custom hook: state management, toggle handler, debounce, 401 redirect
```

**File layout follows `src/components/training-elements/` naming convention.**

```
src/lib/
├── highlight.ts              # computeHighlights() — pure function, no imports from outside lib
├── dates.ts                  # getTrainingWindow() — pure, testable
└── services/
    └── training-logs.ts      # getTrainingLogs() — Supabase service function

src/pages/api/dog/[id]/
└── logs/
    └── index.ts              # POST toggle endpoint

src/pages/dogs/[id]/
└── training.astro            # New page (or could be dashboard.astro with embedded grid)
```

**SSR → client transition uses `useMounted` (canonical pattern, `src/components/hooks/useMounted.ts:1`):**

```tsx
export function TrainingGrid(props: TrainingGridProps) {
  const mounted = useMounted();

  if (!mounted) {
    // SSR + initial render: static non-interactive grid (no layout shift)
    return <StaticTrainingGrid {...props} />;
  }

  return <InteractiveTrainingGrid {...props} />;
}
```

---

## Code References

- `src/layouts/AuthLayout.astro:17-18` — page wrapper max-width and padding context
- `src/styles/global.css:1-2` — `@import "tailwindcss"` (Tailwind 4)
- `src/styles/global.css:75-115` — `@theme inline` custom variables, `@utility bg-cosmic`
- `src/lib/utils.ts` — `cn()` function for safe Tailwind class merging
- `src/components/training-elements/ElementRow.tsx:29-31` — `cn()` conditional class pattern
- `src/components/hooks/useMounted.ts:1` — SSR hydration guard
- `src/components/training-elements/AddElementDialog.tsx:43-45` — 401 redirect pattern
- `src/components/training-elements/TrainingElementsManager.tsx:98-110` — SSR→interactive island swap pattern
- `src/lib/services/training-elements.ts` — service layer pattern to mirror
- `src/pages/api/dog/[id]/elements/index.ts` — API route pattern (zod, 401, try/catch shape)
- `src/types.ts:27-34` — `TrainingLog` interface
- `supabase/migrations/20260530000003_create_training_logs.sql` — UNIQUE constraint, index, RLS
- `context/foundation/prd.md:85-109` — FR-007 highlight business rule (authoritative)
- `context/foundation/roadmap-suggestions.md` — `account_id` integrity warning, pure function recommendation
- `context/foundation/lessons.md` — `useMounted` lesson, 401 lesson, RLS lessons

---

## Architecture Insights

1. **Single toggle endpoint over REST POST/DELETE separation** — The INSERT-first-then-DELETE pattern leverages the UNIQUE constraint as a server-side optimistic lock. The `state: "ticked" | "unticked"` response lets the client correct any optimistic state mismatch without a full re-fetch.

2. **`Promise.all` for SSR fetch parallelism** — Elements and logs are independent queries; running them in parallel halves page load time for the critical initial render.

3. **Memoized derived state chain** — `allTicks → windowTicks (useMemo) → tickCounts (useMemo) → highlights (useMemo)`. Each step is a pure transformation. Any change (new tick, window change) propagates instantly through the chain without extra API calls.

4. **`overflow-y: clip` enables pure-CSS two-axis sticky** — No JavaScript scroll listeners needed for simultaneous sticky header and sticky column. This is the key architectural unlock over earlier approaches that required JS.

5. **Load 30 days of tick history once, filter client-side** — At the data volumes of a training tracker (max ~300 ticks per dog per month), loading 30 days upfront and filtering to 7/14 days client-side is strictly better than three separate API calls per window change.

6. **`useOptimistic` auto-revert** — The React 19 hook reverts to the parent prop value when the enclosing `startTransition` ends without the parent updating. This is the clean failure path: no explicit rollback state, no `try/finally` complexity.

---

## Historical Context (from prior changes)

- `context/changes/db-schema/plan.md` — `training_logs.account_id` is an intentional denormalization for O(1) RLS and index efficiency; the INSERT handler must always source it from `auth.uid()`, never from user input (no FK enforcement exists for this).
- `context/changes/training-elements/plan.md:22-24` — `sort_position` must never use `DEFAULT 0`; training grid renders elements in `sort_position ASC, created_at ASC` order — this is now live and correct.
- `context/changes/training-elements/plan.md:62-64` — dirty-tracking ref pattern (`originalOrder.current`) for "Save order" — analogous consideration does not apply to the grid, but the pattern (ref vs. state for non-UI tracking) is a useful reference.
- `context/foundation/lessons.md` — `useMounted` SSR guard, 401 redirect on all mutating actions, `(select auth.uid())` in RLS, explicit `REVOKE EXECUTE FROM anon` on RPCs — all applicable to the grid's API route and any new migration.

---

## Related Research

None yet. This is the first research artifact for the `training-grid` change.

---

## Open Questions

_All original open questions resolved 2026-06-17. See follow-up section below._

---

## Follow-up Research 2026-06-17 — Resolved Decisions

### Q1 resolved: Grid gets its own page

**Decision:** `/dogs/[id]/grid` is the training grid page. The dog dashboard tile gets a "View training grid" link to that route.

**Architecture impact:**
- New file: `src/pages/dogs/[id]/grid.astro` — mirrors the pattern of `elements.astro`; protected automatically by `PROTECTED_ROUTES` + `DOG_ID_REGEX` in `src/middleware.ts` with no changes needed.
- `src/pages/dogs/[id]/dashboard.astro` gets a new tile: element count summary + "View training grid" link (similar to the existing "Manage elements" tile). No page replacement.
- Component folder: `src/components/training-grid/` (not colocated with `dashboard`).

### Q2 resolved: Newest column on the RIGHT; auto-scroll to right on load

**Decision:** Date columns run oldest → newest left-to-right. The rightmost column is always today. After hydration, the grid container scrolls right so today's column is visible without the handler manually scrolling.

**Column generation:** `dates` array is `[today - (n-1), ..., today - 1, today]` — ascending date order. Index 0 = oldest, last index = today.

```typescript
// src/lib/dates.ts
export function generateDateRange(windowDays: number, today: string): string[] {
  const dates: string[] = [];
  const end = new Date(today);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates; // [oldest, ..., today]
}
```

**Scroll-to-newest on mount:** A `useEffect` runs once after hydration and scrolls the grid wrapper to its maximum `scrollLeft`. This is safe because during SSR the static grid renders without this scroll, and after `useMounted` flips to `true` the ref is available.

```tsx
// In TrainingGrid.tsx (the interactive branch):
const gridWrapperRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (gridWrapperRef.current) {
    // Scroll to the rightmost position (today's column)
    gridWrapperRef.current.scrollLeft = gridWrapperRef.current.scrollWidth;
  }
}, []); // runs once after hydration

return (
  <div ref={gridWrapperRef} className="overflow-x-auto [overflow-y:clip] ...">
    <table>...</table>
  </div>
);
```

**Why `scrollWidth` and not a calculated offset:** `scrollWidth` is the total width of the table content. Setting `scrollLeft = scrollWidth` scrolls to the very end, which is today's column. No column-width arithmetic needed.

**"Today" column visual marker:** The rightmost column (today) gets a distinct border or background so the handler can orient themselves even before reading the header date label:

```tsx
<th className={cn(
  "sticky top-0 z-20 px-2 py-2 text-center text-xs font-semibold text-white/80 min-w-[2.75rem] border-l border-white/10",
  date === today && "border-l-2 border-l-purple-400 text-white"
)}>
  {formatDateShort(date)}
</th>
```

### Q3 resolved: Both empty states are correct

**Confirmed:**
- **Zero elements:** "No training elements yet" message with a link to the elements management page (`/dogs/[id]/elements`). No grid rendered.
- **Elements exist, zero ticks in window:** Full grid is rendered with all rows unhighlighted (no green, no red). No special empty state for this case — the grid structure itself communicates "nothing trained yet."

### Q4 resolved: UTC for MVP

**Decision:** Keep UTC date for MVP. Cloudflare Workers run in UTC; `trained_on` stored as a UTC calendar date. Acceptable edge case for a training tracker. Revisit post-launch if handlers report date mismatch issues.

---

### Algorithm correction: suppression is a post-build check on final set size

**Correction 1 (2026-06-17, original):** Added a suppression rule — if the rank-1 tie group covers ≥ half of all elements, suppress green. Symmetric for red.

**Correction 2 (2026-06-17, this follow-up):** The rank-1 pre-check was in the wrong place. It missed cases where no rank-1 tie exists but all elements still end up highlighted — for example n=3, A=3,B=2,C=1: rank-1 tie = 1 (just A, no tie), so the pre-check does not fire, yet the full green set is {A,B,C} = all 3 = 100%.

**Correction 3 (2026-06-18):** Suppression threshold tightened from strict `>` to `>=`. A set that covers exactly half of all elements (not just more than half) is now also suppressed — the highlight is only meaningful when it singles out a true minority, and "exactly half" doesn't qualify.

**Correction 4 (2026-06-18):** Replaced the single global algorithm with three tiers driven by `n`:
- **n ≤ 3** → no highlights at all. Previously these cases happened to end up suppressed by the half-or-more rule anyway (size-3 always ≥ half at n≤3); this makes that an explicit policy rather than an algorithmic side effect.
- **4 ≤ n ≤ 6** → single-winner only: highlight the rank-1 green and/or rank-1 red individually, and only when each is a unique, non-tied value. No tie expansion, no rank-2/3, no suppression check.
- **n ≥ 7** → unchanged: the full top-3/bottom-3 algorithm with rank-1 tie expansion and half-or-more suppression (Correction 3).

This changes real outcomes for n=4–6 with a unique leader/laggard: previously always suppressed (a clean top-3/bottom-3 set is always ≥ half the elements at n≤6), now Tier 2 surfaces a single green and/or red when the data is decisive enough to have one.

**Correct rule (Tier 3, n ≥ 7):** Build the full set first (rank-1 tie expansion + ranks 2 and 3), then check: if the resulting set covers **half or more** of all elements (`set.size * 2 >= n`), suppress it entirely. This is a post-build check, not a pre-build gate.

**Rule, formally (Tier 3):**
- Build `greenSet` normally.
- If `greenSet.size * 2 >= n`: clear `greenSet` (suppress).
- Build `redSet` normally.
- If `redSet.size * 2 >= n`: clear `redSet` (suppress).
- Each side is independent.

**Minimum n for any highlight to appear:** 4 — Tier 2's single-winner rule can fire as low as n=4, but only when the top (or bottom) value is not tied. Tier 3's full top-3/bottom-3 behaviour starts at n=7; at n=7 with no rank-1 tie, top-3 = 3 elements, 3×2 = 6 which is NOT ≥ 7 → not suppressed.

**Correction 5 (2026-06-20, found via manual testing in Phase 3):** Tier 3's rank-2/rank-3 picks for green (and the mirrored rank-2/3-from-last picks for red) were implemented as "take the next array slot after the rank-1 tie group," with no check on whether that slot's value was itself tied with other elements. Bug report: n=8, one element with 1 tick, the other 7 tied at 0 ticks. Rank 1 = the single 1-tick element (unique, correct). Rank 2 and rank 3 then arbitrarily promoted 2 of the 7 zero-tick elements to green — indistinguishable from the other 5 zero-tick elements, but highlighted anyway, purely because of their position in the sorted array. The half-or-more suppression rule didn't catch this because the resulting set (3 elements out of 8) is well under half.

**Fix:** Ranks 2 and 3 (and their red mirrors) now require the candidate's count to be unique across **all** elements (`countFrequency.get(value) === 1`), symmetric with Tier 2's "only highlight when unique" rule. If the value is tied with any other element, that rank is skipped entirely rather than resolving the tie arbitrarily. None of the original 9 trace-table cases exercise this path (the only n≥7 case consumes rank-1 with a 4-way tie, never reaching ranks 2/3), so all are unaffected; a new test case (n=8, one outlier + 7-way zero tie → green: the outlier only) was added to lock in the fix.

The corrected implementation is in **Section 9** above (now reflecting Correction 5). The `computeHighlights` function there is the authoritative version for planning and implementation.
