import { createClient } from "@supabase/supabase-js";
import type { PostgrestSingleResponse, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_KEY ?? "";

if (!SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required for integration tests — run npx supabase status to get the value",
  );
}
if (!ANON_KEY) {
  throw new Error("SUPABASE_KEY is required for integration tests");
}

/** Service-role client: bypasses RLS. Use for seeding and count-verification. */
export function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Unauthenticated (anon key, no session) client. Use for RLS-boundary checks. */
export function createAnonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a test user via the admin API, signs them in to get a real user JWT,
 * and returns an authClient authenticated as that user.
 *
 * Session flow: sign in directly on authClient with persistSession defaulting
 * to true. In Node.js (no localStorage), GoTrueClient uses an in-memory store,
 * so the session is available to getSession() immediately after signInWithPassword.
 * SupabaseClient._getAccessToken() then returns session.access_token, and
 * fetchWithAuth sets `Authorization: Bearer <userJwt>` on every PostgREST call.
 *
 * cleanup() deletes the user from auth.users (cascades dogs → elements → logs).
 */
export async function createTestUser(admin: SupabaseClient): Promise<{
  userId: string;
  email: string;
  password: string;
  authClient: SupabaseClient;
  cleanup: () => Promise<void>;
}> {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "TestPassword123!";

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    throw createError;
  }

  const userId = createData.user.id;

  try {
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false },
    });

    const { error: signInError } = await authClient.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw signInError;
    }

    // Verify the session is actually in memory before returning — a null here
    // means GoTrueClient's in-memory storage is broken, which would silently
    // fall back to ANON_KEY on every PostgREST request.
    const { data: sessionCheck } = await authClient.auth.getSession();
    if (!sessionCheck.session) {
      throw new Error(
        "signInWithPassword succeeded but getSession() returned null — in-memory session storage not working",
      );
    }

    const cleanup = async (): Promise<void> => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        throw error;
      }
    };

    return { userId, email, password, authClient, cleanup };
  } catch (err) {
    // createUser succeeded but a later step failed — delete the orphaned user before re-throwing.
    await admin.auth.admin.deleteUser(userId);
    throw err;
  }
}

/** Inserts a dog row (service-role, bypasses RLS). */
export async function seedDog(admin: SupabaseClient, accountId: string, name = "Test Dog"): Promise<{ dogId: string }> {
  const result: PostgrestSingleResponse<{ id: string }> = await admin
    .from("dogs")
    .insert({ account_id: accountId, name })
    .select("id")
    .single();
  if (result.error) {
    throw result.error;
  }
  return { dogId: result.data.id };
}

/** Inserts a training element row (service-role, bypasses RLS). */
export async function seedElement(admin: SupabaseClient, dogId: string, name: string): Promise<{ elementId: string }> {
  const result: PostgrestSingleResponse<{ id: string }> = await admin
    .from("training_elements")
    .insert({ dog_id: dogId, name })
    .select("id")
    .single();
  if (result.error) {
    throw result.error;
  }
  return { elementId: result.data.id };
}
