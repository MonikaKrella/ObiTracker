import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "../helpers/db";

const SEED_PATH = path.join("playwright", ".auth", "seed.json");

export default async function globalTeardown(): Promise<void> {
  // A missing/malformed seed file means global-setup failed before writing
  // it (or a prior local run left a stale one) — that failure already
  // surfaced on its own; teardown throwing on top of it would only mask it
  // behind a confusing secondary error.
  let userId: string;
  try {
    const raw = await readFile(SEED_PATH, "utf-8");
    ({ userId } = JSON.parse(raw) as { userId: string });
  } catch {
    console.warn(`global-teardown: no valid seed file at ${SEED_PATH} — nothing to clean up.`);
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.warn(`global-teardown: failed to delete test user ${userId}: ${error.message}`);
  }
}
