import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  const token_hash = context.url.searchParams.get("token_hash");
  const type = context.url.searchParams.get("type");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=Configuration+error");
  }

  if (code) {
    // PKCE authorization code flow — default for @supabase/ssr.
    // The code verifier is stored in a cookie by createClient; exchangeCodeForSession
    // reads it automatically and writes the session cookies before the redirect fires.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
    }
    return context.redirect("/dashboard");
  }

  if (token_hash && type) {
    // OTP / magic-link flow (non-PKCE).
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
    }
    return context.redirect("/dashboard");
  }

  return context.redirect("/auth/signin?error=Invalid+confirmation+link");
};
