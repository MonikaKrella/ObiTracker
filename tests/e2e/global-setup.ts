import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { request } from "@playwright/test";
import { createAdminClient, createTestUser, seedDog, seedElement } from "../../src/lib/tests/helpers/db";

const AUTH_DIR = path.join("playwright", ".auth");
const STORAGE_STATE_PATH = path.join(AUTH_DIR, "user.json");
const SEED_PATH = path.join(AUTH_DIR, "seed.json");
const BASE_URL = "http://localhost:4321";

export default async function globalSetup(): Promise<void> {
  const admin = createAdminClient();

  const { userId, email, password, cleanup } = await createTestUser(admin);

  try {
    const { dogId } = await seedDog(admin, userId);
    const { elementId } = await seedElement(admin, dogId, "Heel");

    await mkdir(AUTH_DIR, { recursive: true });

    const requestContext = await request.newContext({ baseURL: BASE_URL });
    const response = await requestContext.post("/api/auth/signin", {
      form: { email, password },
      headers: { origin: BASE_URL },
      maxRedirects: 0,
    });
    if (response.status() !== 302) {
      throw new Error(`Expected sign-in redirect (302), got ${response.status()}`);
    }

    await requestContext.storageState({ path: STORAGE_STATE_PATH });
    await requestContext.dispose();

    await writeFile(SEED_PATH, JSON.stringify({ userId, dogId, elementId, email }, null, 2));
  } catch (err) {
    // seedDog/seedElement/signin failed after the user was created — delete
    // it rather than leaving an orphan (mirrors db.ts's own createTestUser
    // orphan-guard for the same class of partial-setup failure).
    await cleanup();
    throw err;
  }
}
