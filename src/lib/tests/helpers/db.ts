import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_KEY ?? "";

/** Service-role client: bypasses RLS. Use for seeding and count-verification. */
export function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a test user via the admin API, signs them in via a fresh anon client
 * to get a real user JWT, and returns an authClient authenticated as that user.
 * cleanup() deletes the user from auth.users (cascades dogs → elements → logs).
 */
export async function createTestUser(admin: SupabaseClient): Promise<{
  userId: string;
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

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw signInError;
  }

  const accessToken = signInData.session.access_token;

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const cleanup = async (): Promise<void> => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw error;
    }
  };

  return { userId, authClient, cleanup };
}

/** Inserts a dog row (service-role, bypasses RLS). */
export async function seedDog(admin: SupabaseClient, accountId: string, name = "Test Dog"): Promise<{ dogId: string }> {
  const { data, error } = await admin.from("dogs").insert({ account_id: accountId, name }).select("id").single();
  if (error) {
    throw error;
  }
  return { dogId: data.id };
}

/** Inserts a training element row (service-role, bypasses RLS). */
export async function seedElement(admin: SupabaseClient, dogId: string, name: string): Promise<{ elementId: string }> {
  const { data, error } = await admin.from("training_elements").insert({ dog_id: dogId, name }).select("id").single();
  if (error) {
    throw error;
  }
  return { elementId: data.id };
}
