import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { resetPasswordSchema } from "@/lib/schemas/auth";

export const POST: APIRoute = async (context) => {
  // This route sits outside middleware.ts's PROTECTED_ROUTES matching (that
  // only covers page paths), so the recovery-session check is local here.
  if (!context.locals.user) {
    return context.redirect(
      `/auth/signin?error=${encodeURIComponent("Your reset link has expired. Request a new one.")}`,
    );
  }

  const form = await context.request.formData();
  const parsed = resetPasswordSchema.safeParse({
    password: form.get("password"),
    confirmPassword: form.get("confirmPassword"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent(message)}`);
  }

  const { password } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return context.redirect(`/auth/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/dashboard");
};
