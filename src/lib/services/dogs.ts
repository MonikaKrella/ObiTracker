import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dog } from "@/types";

/**
 * Returns all non-deleted dogs for the authenticated user, ordered by creation date.
 * RLS scopes the query to the session's account_id automatically.
 */
export async function getDogsList(supabase: SupabaseClient): Promise<Dog[]> {
  const result = await supabase
    .from("dogs")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (result.error) throw result.error;
  return (result.data as Dog[] | null) ?? [];
}

/**
 * Fetches a single dog by ID for the authenticated user where is_deleted = FALSE.
 * Returns null if not found, not owned by the caller, or soft-deleted.
 * RLS enforces ownership automatically.
 */
export async function getDogById(supabase: SupabaseClient, dogId: string): Promise<Dog | null> {
  const result = await supabase.from("dogs").select("*").eq("id", dogId).eq("is_deleted", false).maybeSingle();

  if (result.error) throw result.error;
  return result.data as Dog | null;
}

/**
 * Case-insensitive check: does the authenticated user already have a live dog with this name?
 * Special characters % and _ are escaped so they are not treated as SQL wildcard patterns.
 */
export async function isDogNameTaken(supabase: SupabaseClient, name: string): Promise<boolean> {
  const escapedName = name.replace(/%/g, "\\%").replace(/_/g, "\\_");

  const result = await supabase
    .from("dogs")
    .select("id")
    .ilike("name", escapedName)
    .eq("is_deleted", false)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data !== null;
}

/**
 * Creates a new dog for the given account.
 * account_id is sourced from the authenticated session — never from user input.
 * is_deleted defaults to FALSE at the DB level.
 */
export async function createDog(supabase: SupabaseClient, accountId: string, name: string): Promise<Dog> {
  const result = await supabase.from("dogs").insert({ name, account_id: accountId }).select().single();

  if (result.error) throw result.error;
  return result.data as Dog;
}

/**
 * Soft-deletes a dog by setting is_deleted = TRUE and deleted_at = NOW().
 * Returns true if the dog was found (and owned by the caller) and deleted,
 * false if not found or already deleted.
 *
 * Uses the `soft_delete_dog` SECURITY DEFINER RPC to bypass the PostgREST
 * WITH CHECK OPTION issue: after is_deleted = TRUE the row would fail the
 * SELECT policy's `is_deleted = FALSE` filter, causing PostgreSQL to raise
 * "new row violates row-level security policy" even without RETURNING.
 * The function enforces ownership explicitly in its WHERE clause.
 */
export async function softDeleteDog(supabase: SupabaseClient, dogId: string): Promise<boolean> {
  const result = await supabase.rpc("soft_delete_dog", { p_dog_id: dogId });
  if (result.error) throw result.error;
  return result.data as boolean;
}
