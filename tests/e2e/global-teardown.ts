import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "../../src/lib/tests/helpers/db";

const SEED_PATH = path.join("playwright", ".auth", "seed.json");

export default async function globalTeardown(): Promise<void> {
  const raw = await readFile(SEED_PATH, "utf-8");
  const { userId } = JSON.parse(raw) as { userId: string };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw error;
  }
}
