import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Client-side mirror of the API route's zod schema (0-10, quarter-point
 * increments) — same range/quarter-point rule as
 * `competition_scores_score_range_check`. Quarter-point values (multiples of
 * 0.25) are exactly representable in binary floating point, so this
 * comparison is exact, not an approximation.
 */
function isValidScore(value: number): boolean {
  return value >= 0 && value <= 10 && value * 4 === Math.floor(value * 4);
}

interface Props {
  dogId: string;
  competitionId: string;
  exerciseId: string;
  exerciseName: string;
  competedOn: string;
  score: number | null;
  onChange: (next: number | null) => void;
}

/**
 * A single decimal score cell, save-on-blur (user-confirmed, see plan.md).
 * Unlike `TickCell`'s tap-toggle, a blur-triggered save has no per-keystroke
 * race to manage, so no `useOptimistic`/`AbortController` machinery is
 * needed: the parent's `scores` map (and therefore averages/highlights) is
 * only updated after the write succeeds. On failure, only the local input
 * text reverts to the last known-good value — there is nothing in the
 * parent state to unwind, since it was never optimistically changed.
 *
 * The input itself is the visible interactive element (unlike `TickCell`,
 * which hides a full-size native checkbox behind a decorative indicator) —
 * carrying over the tap-target-safe lesson here just means sizing the input
 * generously and never relying on near-invisible (`sr-only`-style) sizing,
 * which is what triggers mobile WebKit/Blink's zoom-into-view heuristic.
 * `text-base` (16px) avoids iOS Safari's separate zoom-on-focus behavior for
 * any input with a smaller font size.
 */
export function ScoreCell({ dogId, competitionId, exerciseId, exerciseName, competedOn, score, onChange }: Props) {
  const [value, setValue] = useState(score === null ? "" : String(score));
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    const trimmed = value.trim();
    const currentDisplay = score === null ? "" : String(score);
    if (trimmed === currentDisplay) {
      return; // unchanged, nothing to save
    }

    setSaving(true);
    try {
      if (trimmed === "") {
        const res = await fetch(`/api/dog/${dogId}/competitions/${competitionId}/scores/${exerciseId}`, {
          method: "DELETE",
        });
        if (res.status === 401) {
          window.location.href = "/auth/signin";
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to clear score");
        }
        onChange(null);
        return;
      }

      const parsed = Number(trimmed);
      if (Number.isNaN(parsed) || !isValidScore(parsed)) {
        toast.error("Score must be between 0 and 10, in quarter-point increments");
        setValue(currentDisplay);
        return;
      }

      const res = await fetch(`/api/dog/${dogId}/competitions/${competitionId}/scores/${exerciseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: parsed }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to save score");
      }
      onChange(parsed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save — please try again");
      setValue(currentDisplay);
    } finally {
      setSaving(false);
    }
  }

  return (
    <td role="gridcell" className="p-1 text-center">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={saving}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onBlur={() => {
          void handleBlur();
        }}
        aria-label={`${exerciseName}, ${competedOn}`}
        className={cn(
          "mx-auto h-10 w-14 rounded-md border border-white/20 bg-transparent text-center text-base text-white",
          "focus-visible:border-purple-400/60 focus-visible:ring-[3px] focus-visible:ring-purple-400/60 focus-visible:outline-none",
          "disabled:opacity-50",
        )}
      />
    </td>
  );
}
