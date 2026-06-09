import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { isDogNameTaken, createDog } from "@/lib/services/dogs";

export const prerender = false;

const createDogSchema = z.object({
  name: z.string().trim().min(1, "Dog name is required").max(100, "Dog name must be 100 characters or fewer"),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await context.request.formData();
  const parsed = createDogSchema.safeParse({ name: form.get("name") });

  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return Response.json({ error: message }, { status: 400 });
  }

  const { name } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const taken = await isDogNameTaken(supabase, name);
    if (taken) {
      return Response.json({ error: "A dog with that name already exists" }, { status: 409 });
    }

    await createDog(supabase, context.locals.user.id, name);
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
