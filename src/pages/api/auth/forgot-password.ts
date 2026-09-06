import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { forgotPasswordSchema } from "@/lib/schemas/auth";

const RATE_LIMIT_CODES = new Set(["over_request_rate_limit", "over_email_send_rate_limit"]);

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = forgotPasswordSchema.safeParse({
    email: form.get("email"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(message)}`);
  }

  const { email } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Route the PKCE recovery code back to our confirm handler, marked as a
  // recovery flow so confirm.ts can send it to /auth/reset-password instead
  // of /dashboard.
  const redirectTo = `${new URL(context.request.url).origin}/api/auth/confirm?flow=recovery`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Anti-enumeration: any outcome other than a rate limit looks identical to
  // the handler, whether or not the email has an account.
  if (error && RATE_LIMIT_CODES.has(error.code ?? "")) {
    return context.redirect(
      `/auth/forgot-password?error=${encodeURIComponent("Too many requests — please wait a moment and try again.")}`,
    );
  }

  if (error) {
    // Logged for ops visibility only — the client always sees the same
    // success redirect regardless of this error, per anti-enumeration above.
    console.error("resetPasswordForEmail failed:", error);
  }

  return context.redirect("/auth/reset-link-sent");
};
