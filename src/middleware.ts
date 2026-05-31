import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { getDogById } from "@/lib/services/dogs";

const PROTECTED_ROUTES = ["/dashboard", "/dogs"];
const UNAUTHENTICATED_ONLY_ROUTES = ["/auth/signin", "/auth/signup"];

// Matches /dogs/<uuid> — UUID-only segments so /dogs/new is never treated as an ID.
const DOG_ID_REGEX = /^\/dogs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (
    PROTECTED_ROUTES.some((route) => context.url.pathname === route || context.url.pathname.startsWith(route + "/"))
  ) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (
    UNAUTHENTICATED_ONLY_ROUTES.some(
      (route) => context.url.pathname === route || context.url.pathname.startsWith(route + "/"),
    )
  ) {
    if (context.locals.user) {
      return context.redirect("/dashboard");
    }
  }

  // Resolve selectedDog for /dogs/<uuid>/* routes.
  // The UUID regex intentionally excludes named segments like "new".
  // API routes under /api/dog/* use a different prefix and are not affected.
  const dogMatch = DOG_ID_REGEX.exec(context.url.pathname);
  if (dogMatch?.[1] && supabase && context.locals.user) {
    const dogId = dogMatch[1];
    const dog = await getDogById(supabase, dogId);
    if (!dog) {
      // Redirect with a flash param so FlashToast (Phase 3) can surface the error.
      return context.redirect("/dashboard?flash=dog_not_found");
    }
    context.locals.selectedDog = dog;
  } else {
    context.locals.selectedDog = null;
  }

  return next();
});
