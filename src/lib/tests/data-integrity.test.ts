import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteTrainingElement } from "../services/training-elements";
import { toggleTrainingLog } from "../services/training-logs";
import { createAdminClient, createTestUser, seedDog, seedElement } from "./helpers/db";

describe("data integrity", () => {
  let admin: SupabaseClient;
  let authClient: SupabaseClient;
  let userId: string;
  let dogId: string;
  let userCleanup: () => Promise<void>;

  beforeEach(async () => {
    admin = createAdminClient();
    ({ userId, authClient, cleanup: userCleanup } = await createTestUser(admin));
    ({ dogId } = await seedDog(admin, userId));
  });

  afterEach(async () => {
    await userCleanup(); // cascades dogs → elements → logs
  });

  describe("tick-toggle idempotency", () => {
    it("happy-path: sequential tick then untick persists and removes the log row", async () => {
      const { elementId } = await seedElement(admin, dogId, "Sit");
      const trainedOn = "2026-01-15";

      const tickResult = await toggleTrainingLog(authClient, dogId, elementId, userId, trainedOn);
      expect(tickResult).toBe("ticked");

      const { count: countAfterTick, error: errorAfterTick } = await admin
        .from("training_logs")
        .select("*", { count: "exact", head: true })
        .eq("element_id", elementId)
        .eq("trained_on", trainedOn);
      if (errorAfterTick) {
        throw errorAfterTick;
      }
      expect(countAfterTick).toBe(1);

      const untickResult = await toggleTrainingLog(authClient, dogId, elementId, userId, trainedOn);
      expect(untickResult).toBe("unticked");

      const { count: countAfterUntick, error: errorAfterUntick } = await admin
        .from("training_logs")
        .select("*", { count: "exact", head: true })
        .eq("element_id", elementId)
        .eq("trained_on", trainedOn);
      if (errorAfterUntick) {
        throw errorAfterUntick;
      }
      expect(countAfterUntick).toBe(0);
    });

    it("Risk #3: concurrent duplicate toggles never produce two log rows for the same cell", async () => {
      const { elementId } = await seedElement(admin, dogId, "Down");
      const trainedOn = "2026-01-16";

      const results = await Promise.all([
        toggleTrainingLog(authClient, dogId, elementId, userId, trainedOn),
        toggleTrainingLog(authClient, dogId, elementId, userId, trainedOn),
      ]);

      expect([...results].sort()).toEqual(["ticked", "unticked"]);

      const { count, error } = await admin
        .from("training_logs")
        .select("*", { count: "exact", head: true })
        .eq("element_id", elementId)
        .eq("trained_on", trainedOn);
      if (error) {
        throw error;
      }
      expect(count).not.toBe(2);
    });
  });

  describe("element-deletion cascade (Risk #6)", () => {
    it("deleting element A removes only its logs, not element B's logs on the same dog", async () => {
      const { elementId: elementIdA } = await seedElement(admin, dogId, "Sit");
      const { elementId: elementIdB } = await seedElement(admin, dogId, "Down");
      const trainedOn = "2026-01-10";

      await toggleTrainingLog(authClient, dogId, elementIdA, userId, trainedOn);
      await toggleTrainingLog(authClient, dogId, elementIdB, userId, trainedOn);

      const deleted = await deleteTrainingElement(authClient, dogId, elementIdA);
      expect(deleted).toBe(true);

      const { count: countA, error: errorA } = await admin
        .from("training_logs")
        .select("*", { count: "exact", head: true })
        .eq("element_id", elementIdA);
      if (errorA) {
        throw errorA;
      }
      expect(countA).toBe(0);

      const { count: countB, error: errorB } = await admin
        .from("training_logs")
        .select("*", { count: "exact", head: true })
        .eq("element_id", elementIdB);
      if (errorB) {
        throw errorB;
      }
      expect(countB).toBe(1);
    });
  });
});
