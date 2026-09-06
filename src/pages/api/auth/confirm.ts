import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

// Allowlist of valid OTP types accepted by supabase.auth.verifyOtp.
const otpTypeSchema = z.enum([
  "signup",
  "recovery",
  "invite",
  "email",
  "magiclink",
  "sms",
  "phone_change",
  "email_change",
]);

const RECOVERY_LINK_ERROR =
  "This reset link didn't work — it may have expired, already been used, or only works on the device/browser you requested it from. Request a new one from the sign-in page.";

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  const token_hash = context.url.searchParams.get("token_hash");
  const type = context.url.searchParams.get("type");
  const flow = context.url.searchParams.get("flow");
  const successRedirect = flow === "recovery" ? "/auth/reset-password" : "/dashboard";

  // The two flows are mutually exclusive — reject if both params are present.
  if (code && token_hash) {
    return context.redirect("/auth/signin?error=Invalid+confirmation+link");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Configuration error")}`);
  }

  if (code) {
    // PKCE authorization code flow — default for @supabase/ssr.
    // The code verifier is stored in a cookie by createClient; exchangeCodeForSession
    // reads it automatically and writes the session cookies before the redirect fires.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const message = flow === "recovery" ? RECOVERY_LINK_ERROR : error.message;
      return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
    }
    return context.redirect(successRedirect);
  }

  if (token_hash && type) {
    // Validate type against the known OTP allowlist before calling Supabase.
    const parsedType = otpTypeSchema.safeParse(type);
    if (!parsedType.success) {
      return context.redirect("/auth/signin?error=Invalid+confirmation+link");
    }
    // OTP / magic-link flow (non-PKCE).
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: parsedType.data });
    if (error) {
      const message = flow === "recovery" ? RECOVERY_LINK_ERROR : error.message;
      return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
    }
    return context.redirect(successRedirect);
  }

  return context.redirect("/auth/signin?error=Invalid+confirmation+link");
};
