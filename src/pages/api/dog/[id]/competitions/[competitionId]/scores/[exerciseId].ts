import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { getDogById } from "@/lib/services/dogs";
import { competitionBelongsToDog, upsertCompetitionScore, deleteCompetitionScore } from "@/lib/services/competitions";

export const prerender = false;

// Client-side mirror of the DB CHECK constraint (competition_scores_score_range_check):
// 0-10 range, quarter-point increments only. Quarter-point values (multiples of 0.25)
// are exactly representable in binary floating point, so this comparison is exact.
const scoreSchema = z.object({
  score: z
    .number()
    .min(0, "Score must be between 0 and 10")
    .max(10, "Score must be between 0 and 10")
    .refine((v) => v * 4 === Math.floor(v * 4), "Score must be in quarter-point increments"),
});

function parseRouteParams(params: { id?: string; competitionId?: string; exerciseId?: string }) {
  const parsedDogId = z.uuid().safeParse(params.id);
  const parsedCompetitionId = z.uuid().safeParse(params.competitionId);
  const parsedExerciseId = z.uuid().safeParse(params.exerciseId);
  if (!parsedDogId.success || !parsedCompetitionId.success || !parsedExerciseId.success) {
    return null;
  }
  return { dogId: parsedDogId.data, competitionId: parsedCompetitionId.data, exerciseId: parsedExerciseId.data };
}

function errorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : typeof err === "object" && err !== null && "message" in err
      ? String(err.message)
      : "An unexpected error occurred";
}

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const routeParams = parseRouteParams(context.params);
  if (!routeParams) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const { dogId, competitionId, exerciseId } = routeParams;

  const body: unknown = await context.request.json();
  const parsedBody = scoreSchema.safeParse(body);
  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0].message;
    return Response.json({ error: message }, { status: 400 });
  }
  const { score } = parsedBody.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await getDogById(supabase, dogId);
    if (!dog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const belongsToDog = await competitionBelongsToDog(supabase, dogId, competitionId);
    if (!belongsToDog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await upsertCompetitionScore(supabase, competitionId, exerciseId, context.locals.user.id, score);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const routeParams = parseRouteParams(context.params);
  if (!routeParams) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const { dogId, competitionId, exerciseId } = routeParams;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await getDogById(supabase, dogId);
    if (!dog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const belongsToDog = await competitionBelongsToDog(supabase, dogId, competitionId);
    if (!belongsToDog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await deleteCompetitionScore(supabase, competitionId, exerciseId);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
};
