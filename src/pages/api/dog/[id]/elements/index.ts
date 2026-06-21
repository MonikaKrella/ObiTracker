import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { getDogById } from "@/lib/services/dogs";
import { isElementNameTaken, createTrainingElement } from "@/lib/services/training-elements";

export const prerender = false;

const elementNameSchema = z.object({
  name: z.string().trim().min(1, "Element name is required").max(100, "Element name must be 100 characters or fewer"),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedId = z.uuid().safeParse(context.params.id);
  if (!parsedId.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsedId.data;

  const body: unknown = await context.request.json();
  const parsedBody = elementNameSchema.safeParse(body);
  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0].message;
    return Response.json({ error: message }, { status: 400 });
  }
  const { name } = parsedBody.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await getDogById(supabase, dogId);
    if (!dog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const taken = await isElementNameTaken(supabase, dogId, name);
    if (taken) {
      return Response.json({ error: "An element with that name already exists" }, { status: 409 });
    }

    const element = await createTrainingElement(supabase, dogId, name);
    return Response.json({ success: true, element });
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
