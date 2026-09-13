import { z } from "zod";
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { renameDog, softDeleteDog } from "@/lib/services/dogs";

export const prerender = false;

const dogNameSchema = z.object({
  name: z.string().trim().min(1, "Dog name is required").max(100, "Dog name must be 100 characters or fewer"),
});

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = z.uuid().safeParse(context.params.id);
  if (!parsed.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsed.data;

  const body: unknown = await context.request.json();
  const parsedBody = dogNameSchema.safeParse(body);
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
    const dog = await renameDog(supabase, dogId, name);
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

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = z.uuid().safeParse(context.params.id);
  if (!parsed.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const deleted = await softDeleteDog(supabase, dogId);
    if (!deleted) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ success: true });
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
