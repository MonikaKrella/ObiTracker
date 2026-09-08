import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { getDogById } from "@/lib/services/dogs";
import { createCompetition } from "@/lib/services/competitions";

export const prerender = false;

const createCompetitionSchema = z.object({
  classId: z.uuid("Invalid class ID"),
  competedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)"),
});

const uniqueViolationErrorCode = "23505"; // Postgres unique violation

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedDogId = z.uuid().safeParse(context.params.id);
  if (!parsedDogId.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsedDogId.data;

  const body: unknown = await context.request.json();
  const parsedBody = createCompetitionSchema.safeParse(body);
  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0].message;
    return Response.json({ error: message }, { status: 400 });
  }
  const { classId, competedOn } = parsedBody.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await getDogById(supabase, dogId);
    if (!dog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const competition = await createCompetition(supabase, dogId, classId, context.locals.user.id, competedOn);
    return Response.json({ success: true, competition });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === uniqueViolationErrorCode) {
      return Response.json({ error: "A competition already exists on this date for this class" }, { status: 409 });
    }

    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "An unexpected error occurred";
    return Response.json({ error: message }, { status: 500 });
  }
};
