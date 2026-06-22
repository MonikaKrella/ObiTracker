/**
 * Opaque background colors for every sticky cell (corner, sticky header row,
 * sticky name column) across the training grid. Sticky cells MUST be fully
 * opaque, not a translucent `bg-white/10` — translucent stickies let the
 * date columns scrolling underneath show through (see research.md "iOS
 * Safari critical requirements"). Each shade is a hand-picked opaque
 * approximation of the card's actual translucent look (`bg-cosmic` page
 * gradient + `bg-white/5` card overlay, optionally tinted by
 * `bg-emerald-500/15`/`bg-rose-500/15`) so the sticky name column still
 * visibly carries its highlight color while scrolled, without ever being
 * see-through.
 *
 * Shared by `TrainingGrid.tsx` and `TrainingGridRow.tsx` — kept in its own
 * module so the two don't form a circular import over a single constant.
 */
export const STICKY_BG = new Map<"green" | "red" | null, string>([
  [null, "bg-[#181c2b]"],
  ["green", "bg-[#173438]"],
  ["red", "bg-[#392133]"],
]);

/** Opaque, slightly-lighter variant of `STICKY_BG`'s neutral shade, used only
 * on today's sticky date header so the column reads as "lighter" without
 * reintroducing the translucent-sticky bleed-through bug. */
export const TODAY_HEADER_BG = "bg-[#262b3e]";
