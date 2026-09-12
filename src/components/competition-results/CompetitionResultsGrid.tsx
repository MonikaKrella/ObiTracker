import { useMemo, useState } from "react";
import { Loader2Icon, Star } from "lucide-react";
import { toast } from "sonner";
import { useMounted } from "@/components/hooks/useMounted";
import { CompetitionBoard, type ScoreRecord } from "@/lib/domain/competition-board";
import { getCompetitionWindow, formatHeaderDate, type CompetitionTimeWindow } from "@/lib/dates";
import { STICKY_BG } from "@/components/training-grid/sticky-colors";
import {
  COMPETITION_WINDOW_OPTIONS,
  COMPETITION_WINDOW_COOKIE_NAME,
  COMPETITION_WINDOW_COOKIE_MAX_AGE,
} from "@/components/competition-results/window-options";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScoreCell } from "@/components/competition-results/ScoreCell";
import { AddCompetitionDialog } from "@/components/competition-results/AddCompetitionDialog";
import { cn } from "@/lib/utils";
import { COMPETITION_CLASSES } from "@/const";
import type { Competition, CompetitionScore, Exercise } from "@/types";

interface Props {
  dogId: string;
  dogName: string;
  exercises: Exercise[];
  competitions: Competition[];
  scores: Pick<CompetitionScore, "competition_id" | "exercise_id" | "score">[];
  selectedClassNumber: number;
  dogDefaultClassNumber: number | null;
  initialWindow: CompetitionTimeWindow;
  serviceUnavailable: boolean;
}

const WINDOW_LABELS: Record<CompetitionTimeWindow, string> = {
  "all-time": "All time",
  "last-year": "Last year",
  "last-6-months": "Last 6 months",
};

/**
 * Narrower on mobile (`exercise.shortcut`, e.g. "Dist.contr.") than desktop
 * (`exercise.name` + multiplier, e.g. "Distance control ×4") — at the
 * training grid's fixed 250px name-column width, a 375px mobile viewport had
 * room for only one competition date column. `exercises.shortcut` is
 * reference data purpose-built for this compact display (see
 * competition-reference-data.test.ts).
 */
const EXERCISE_COL_WIDTH = "w-32 sm:w-[15.625rem]";

// A plain function call (not an inline `document.cookie = ...` assignment
// inside the component) — see TrainingGrid.tsx's identical `setWindowCookie`
// for the react-compiler-lint rationale.
function setWindowCookie(window: CompetitionTimeWindow) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COMPETITION_WINDOW_COOKIE_NAME}=${window}; path=/; max-age=${COMPETITION_WINDOW_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/** competitionId -> exerciseId -> score, built from the SSR-fetched flat score rows. */
function buildScoresByCompetition(
  scores: Pick<CompetitionScore, "competition_id" | "exercise_id" | "score">[],
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const row of scores) {
    const byExercise = map.get(row.competition_id) ?? new Map<string, number>();
    byExercise.set(row.exercise_id, row.score);
    map.set(row.competition_id, byExercise);
  }
  return map;
}

/**
 * Competition results grid island. `competitions`/`scores` are always the
 * dog+class's full "all-time" data (see competition-results.astro) — the
 * all-time/last-year/last-6-months selector filters both the visible
 * columns AND which scores feed `CompetitionBoard`, entirely client-side, no
 * refetch. Switching the competition CLASS is instead a full page
 * navigation (see plan.md "Critical Implementation Details") since that
 * changes the entire dataset.
 */
export function CompetitionResultsGrid({
  dogId,
  dogName,
  exercises,
  competitions: initialCompetitions,
  scores: initialScores,
  selectedClassNumber,
  dogDefaultClassNumber: initialDogDefaultClassNumber,
  initialWindow,
  serviceUnavailable,
}: Props) {
  const mounted = useMounted();
  const [competitions, setCompetitions] = useState(initialCompetitions);
  const [scoresByCompetition, setScoresByCompetition] = useState(() => buildScoresByCompetition(initialScores));
  const [selectedWindow, setSelectedWindow] = useState<CompetitionTimeWindow>(initialWindow);
  const [dogDefaultClassNumber, setDogDefaultClassNumber] = useState(initialDogDefaultClassNumber);
  const [isTogglingDefault, setIsTogglingDefault] = useState(false);
  const isCurrentDefault = selectedClassNumber === dogDefaultClassNumber;
  // Not reset back to false anywhere — set right before the full-page
  // navigation below, so it just stays true until the browser unloads this
  // page (mirrors the "stay loading — navigating away" convention used by
  // AddElementDialog.tsx et al.). Combined with `!mounted` below, this covers
  // both moments a handler observed looking like a broken page rather than a
  // loading one: the SSR→hydrate gap on first paint, and the blank/frozen
  // browser tab during a class switch's full navigation round trip.
  const [isNavigating, setIsNavigating] = useState(false);
  const isLoading = !mounted || isNavigating;

  function handleWindowChange(next: CompetitionTimeWindow) {
    setSelectedWindow(next);
    setWindowCookie(next);
  }

  function handleClassChange(value: string) {
    const classNumber = Number(value);
    setIsNavigating(true);
    window.location.href = `/dogs/${dogId}/competition-results?classNumber=${classNumber}`;
  }

  async function handleToggleDefault() {
    const nextClassNumber = isCurrentDefault ? null : selectedClassNumber;
    setIsTogglingDefault(true);
    try {
      const res = await fetch(`/api/dog/${dogId}/default-class`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classNumber: nextClassNumber }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to update default class");
      }
      setDogDefaultClassNumber(nextClassNumber);
      toast.success(nextClassNumber === null ? "Default cleared" : `Class ${nextClassNumber} set as default`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save — please try again");
    } finally {
      setIsTogglingDefault(false);
    }
  }

  function handleScoreChange(competitionId: string, exerciseId: string, score: number | null) {
    setScoresByCompetition((prev) => {
      const next = new Map(prev);
      const byExercise = new Map(next.get(competitionId) ?? []);
      if (score === null) {
        byExercise.delete(exerciseId);
      } else {
        byExercise.set(exerciseId, score);
      }
      next.set(competitionId, byExercise);
      return next;
    });
  }

  function handleCompetitionAdded(competition: Competition) {
    setCompetitions((prev) => [...prev, competition].sort((a, b) => (a.competed_on < b.competed_on ? -1 : 1)));
  }

  const visibleCompetitions = useMemo(() => {
    const { startDate, endDate } = getCompetitionWindow(selectedWindow);
    return competitions.filter(
      (competition) =>
        (startDate === null || competition.competed_on >= startDate) && competition.competed_on <= endDate,
    );
  }, [competitions, selectedWindow]);

  const scoreRecords: ScoreRecord[] = useMemo(() => {
    const visibleIds = new Set(visibleCompetitions.map((competition) => competition.id));
    const records: ScoreRecord[] = [];
    for (const [competitionId, byExercise] of scoresByCompetition) {
      if (!visibleIds.has(competitionId)) {
        continue;
      }
      for (const [exerciseId, score] of byExercise) {
        records.push({ exerciseId, score });
      }
    }
    return records;
  }, [scoresByCompetition, visibleCompetitions]);

  const board = useMemo(() => CompetitionBoard.create(exercises, scoreRecords), [exercises, scoreRecords]);
  const averages = useMemo(() => board.averages(), [board]);
  const highlights = useMemo(() => board.highlights(), [board]);

  if (serviceUnavailable) {
    return <ServiceUnavailableGrid />;
  }

  return (
    <div className="relative space-y-3">
      {isLoading && (
        <div
          role="status"
          className="absolute inset-0 z-50 flex items-center justify-center gap-2 rounded-2xl bg-black/40 text-sm text-white/80"
        >
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}

      {/* Row 1: class select + add-competition — the pair that needs to stay
          together, wrapping onto its own second line as a unit if the
          viewport is too narrow for both, rather than the time-window row
          wedging itself between them. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={String(selectedClassNumber)} onValueChange={handleClassChange}>
            <SelectTrigger aria-label="Competition class" disabled={!mounted}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPETITION_CLASSES.map((cls) => (
                <SelectItem key={cls.class_number} value={String(cls.class_number)}>
                  {cls.name}
                  {cls.class_number === dogDefaultClassNumber && <span className="text-white/40"> · Default</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            disabled={!mounted || isTogglingDefault}
            aria-label={isCurrentDefault ? "Clear default" : "Set as default"}
            title={isCurrentDefault ? "Clear default" : "Set as default"}
            onClick={() => {
              void handleToggleDefault();
            }}
            className="disabled:opacity-50"
          >
            <Star className={cn("size-5 text-yellow-400", isCurrentDefault && "fill-yellow-400")} />
          </button>
        </div>

        <AddCompetitionDialog dogId={dogId} classNumber={selectedClassNumber} onAdded={handleCompetitionAdded} />
      </div>

      {/* Row 2: time-window selector, always below row 1. */}
      <div className="flex flex-wrap gap-2">
        {COMPETITION_WINDOW_OPTIONS.map((window) => (
          <Button
            key={window}
            type="button"
            variant={selectedWindow === window ? "default" : "outline"}
            size="sm"
            disabled={!mounted}
            onClick={() => {
              handleWindowChange(window);
            }}
          >
            {WINDOW_LABELS[window]}
          </Button>
        ))}
      </div>

      {visibleCompetitions.length === 0 ? (
        <EmptyCompetitionsGrid exercises={exercises} />
      ) : (
        <div
          data-testid="competition-results-scroll"
          className="w-full overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5"
        >
          <table
            role="grid"
            aria-label={`Competition results for ${dogName}`}
            className="table-fixed border-collapse text-sm"
          >
            <thead>
              <tr>
                <th
                  className={cn(
                    "sticky top-0 left-0 z-30 px-3 py-2 text-left",
                    EXERCISE_COL_WIDTH,
                    STICKY_BG.get(null),
                  )}
                >
                  Exercise
                </th>
                {visibleCompetitions.map((competition) => (
                  <th
                    key={competition.id}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-20 w-[4.5rem] border-l border-white/10 px-1.5 py-2 text-center text-xs font-semibold text-white/80",
                      STICKY_BG.get(null),
                    )}
                  >
                    {formatHeaderDate(competition.competed_on)}
                  </th>
                ))}
                {/* Simultaneously top- and right-sticky corner — z-30 to match the
                    top-left corner, per plan.md's sticky z-index contract. */}
                <th
                  scope="col"
                  className={cn(
                    "sticky top-0 right-0 z-30 w-[4rem] border-l border-white/10 px-1.5 py-2 text-center text-xs font-semibold text-white/80",
                    STICKY_BG.get(null),
                  )}
                >
                  Avg
                </th>
              </tr>
            </thead>
            <tbody>
              {exercises.map((exercise) => {
                const highlight = highlights.get(exercise.id) ?? null;
                const average = averages.get(exercise.id) ?? null;

                return (
                  <tr key={exercise.id} className="border-b border-white/10">
                    <th
                      scope="row"
                      role="rowheader"
                      title={exercise.name}
                      className={cn(
                        "sticky left-0 z-20 truncate px-3 py-2 text-left font-medium text-white",
                        EXERCISE_COL_WIDTH,
                        STICKY_BG.get(highlight),
                      )}
                    >
                      <span className="sm:hidden">{exercise.shortcut}</span>
                      <span className="hidden sm:inline">
                        {exercise.name} <span className="text-white/40">×{exercise.multiplier}</span>
                      </span>
                    </th>
                    {visibleCompetitions.map((competition) => (
                      <ScoreCell
                        key={competition.id}
                        dogId={dogId}
                        competitionId={competition.id}
                        exerciseId={exercise.id}
                        exerciseName={exercise.name}
                        competedOn={competition.competed_on}
                        score={scoresByCompetition.get(competition.id)?.get(exercise.id) ?? null}
                        onChange={(score) => {
                          handleScoreChange(competition.id, exercise.id, score);
                        }}
                      />
                    ))}
                    <td
                      className={cn(
                        "sticky right-0 z-20 w-[4rem] border-l border-white/10 px-1.5 py-2 text-center font-semibold text-white",
                        STICKY_BG.get(highlight),
                      )}
                    >
                      {average === null ? "—" : average.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton table markup shared by `ServiceUnavailableGrid` and
 * `EmptyCompetitionsGrid` — mirrors `TrainingGrid.tsx`'s `SkeletonGridTable`
 * shape, with `rowCount` scoped to this grid's exercise set instead of a
 * hardcoded constant (exercises are fixed reference data, always known even
 * when no competitions have been added yet).
 */
function SkeletonGridTable({ rowCount }: { rowCount: number }) {
  return (
    <table aria-hidden="true" className="table-fixed border-collapse text-sm">
      <thead>
        <tr>
          <th className={cn("sticky top-0 left-0 z-30", EXERCISE_COL_WIDTH, STICKY_BG.get(null))}></th>
          {Array.from({ length: 3 }).map((_, i) => (
            <th
              key={i}
              className={cn("sticky top-0 z-20 w-[4.5rem] border-l border-white/10 px-1.5 py-2", STICKY_BG.get(null))}
            ></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }).map((_, rowIndex) => (
          <tr key={rowIndex} className="border-b border-white/10">
            <th className={cn("sticky left-0 z-20 px-3 py-2", EXERCISE_COL_WIDTH, STICKY_BG.get(null))}>
              <div className="h-4 w-24 animate-pulse rounded bg-white/5 sm:w-48" />
            </th>
            {Array.from({ length: 3 }).map((_, colIndex) => (
              <td key={colIndex} className="p-1">
                <div className="mx-auto h-6 w-10 animate-pulse rounded bg-white/5" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Rendered when Supabase env vars are missing, or the SSR fetch/validation
 * failed. Mirrors `TrainingGrid.tsx`'s `ServiceUnavailableGrid`.
 */
function ServiceUnavailableGrid() {
  return (
    <div className="relative w-full overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5">
      <SkeletonGridTable rowCount={5} />
      <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-black/40 text-center text-sm text-white/80">
        Something went wrong, please try later.
      </div>
    </div>
  );
}

/**
 * Rendered when the dog has no competitions yet in the selected class (or
 * window). The "Add competition" trigger already lives in the toolbar row
 * above, so the empty state only needs to point at it, not duplicate it.
 */
function EmptyCompetitionsGrid({ exercises }: { exercises: Exercise[] }) {
  return (
    <div className="relative w-full overflow-x-auto [overflow-y:clip] rounded-2xl border border-white/10 bg-white/5">
      <SkeletonGridTable rowCount={exercises.length || 5} />
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/40 text-center">
        <p className="text-base text-white/80">No competitions yet in this class</p>
        <p className="text-sm text-white/60">Use &ldquo;Add competition&rdquo; above to add one.</p>
      </div>
    </div>
  );
}
