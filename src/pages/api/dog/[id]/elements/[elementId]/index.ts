import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { getDogById } from "@/lib/services/dogs";
import { isElementNameTaken, renameTrainingElement, deleteTrainingElement } from "@/lib/services/training-elements";

export const prerender = false;

const elementNameSchema = z.object({
  name: z.string().trim().min(1, "Element name is required").max(100, "Element name must be 100 characters or fewer"),
});

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedDogId = z.uuid().safeParse(context.params.id);
  const parsedElementId = z.uuid().safeParse(context.params.elementId);
  if (!parsedDogId.success || !parsedElementId.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsedDogId.data;
  const elementId = parsedElementId.data;

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

    const taken = await isElementNameTaken(supabase, dogId, name, elementId);
    if (taken) {
      return Response.json({ error: "An element with that name already exists" }, { status: 409 });
    }

    const element = await renameTrainingElement(supabase, dogId, elementId, name);
    if (!element) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

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

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedDogId = z.uuid().safeParse(context.params.id);
  const parsedElementId = z.uuid().safeParse(context.params.elementId);
  if (!parsedDogId.success || !parsedElementId.success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const dogId = parsedDogId.data;
  const elementId = parsedElementId.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const dog = await getDogById(supabase, dogId);
    if (!dog) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const deleted = await deleteTrainingElement(supabase, dogId, elementId);
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
