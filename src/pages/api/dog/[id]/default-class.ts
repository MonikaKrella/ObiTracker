import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { setDefaultClassNumber } from "@/lib/services/dogs";
import { COMPETITION_CLASSES } from "@/const";

export const prerender = false;

const defaultClassSchema = z.object({
  classNumber: z.union([...COMPETITION_CLASSES.map((c) => z.literal(c.class_number)), z.null()]),
});

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedDogId = z.uuid().safeParse(context.params.id);
  if (!parsedDogId.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsedDogId.data;

  const body: unknown = await context.request.json();
  const parsedBody = defaultClassSchema.safeParse(body);
  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0].message;
    return Response.json({ error: message }, { status: 400 });
  }
  const { classNumber } = parsedBody.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await setDefaultClassNumber(supabase, dogId, classNumber);
    if (!dog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json({ success: true, dog });
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
