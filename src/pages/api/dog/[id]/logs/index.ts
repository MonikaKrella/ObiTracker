import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { getDogById } from "@/lib/services/dogs";
import { elementBelongsToDog } from "@/lib/services/training-elements";
import { toggleTrainingLog } from "@/lib/services/training-logs";
import { isFutureUtcDate } from "@/lib/dates";

export const prerender = false;

const toggleSchema = z.object({
  elementId: z.uuid("Invalid element ID"),
  trainedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)")
    .refine((v) => !isFutureUtcDate(v), "Cannot log a future date"),
});

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
  const parsedBody = toggleSchema.safeParse(body);
  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0].message;
    return Response.json({ error: message }, { status: 400 });
  }
  const { elementId, trainedOn } = parsedBody.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await getDogById(supabase, dogId);
    if (!dog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const belongsToDog = await elementBelongsToDog(supabase, dogId, elementId);
    if (!belongsToDog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const state = await toggleTrainingLog(supabase, dogId, elementId, context.locals.user.id, trainedOn);
    return Response.json({ success: true, state });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "An unexpected error occurred";
    return Response.json({ error: message }, { status: 500 });
  }
};
