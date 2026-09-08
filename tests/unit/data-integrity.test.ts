import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteTrainingElement } from "../../src/lib/services/training-elements";
import { toggleTrainingLog } from "../../src/lib/services/training-logs";
import { upsertCompetitionScore } from "../../src/lib/services/competitions";
import { createAdminClient, createTestUser, seedDog, seedElement, seedCompetition } from "../helpers/db";

describe("data integrity", () => {
  let admin: SupabaseClient;
  let authClient: SupabaseClient;
  let userId: string;
  let dogId: string;
  let classId: string;
  let exerciseId: string;
  let userCleanup: () => Promise<void>;

  beforeEach(async () => {
    admin = createAdminClient();
    ({ userId, authClient, cleanup: userCleanup } = await createTestUser(admin));
    ({ dogId } = await seedDog(admin, userId));

    const classResult = await admin
      .from("competition_classes")
      .select("id")
      .eq("class_number", 1)
      .single<{ id: string }>();
    if (classResult.error) {
      throw classResult.error;
    }
    classId = classResult.data.id;

    const exerciseResult = await admin
      .from("exercises")
      .select("id")
      .eq("class_id", classId)
      .order("sort_position", { ascending: true })
      .limit(1)
      .single<{ id: string }>();
    if (exerciseResult.error) {
      throw exerciseResult.error;
    }
    exerciseId = exerciseResult.data.id;
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

    // Covers Risk #3 (test-plan.md §3)
    it("concurrent duplicate toggles never produce two log rows for the same cell", async () => {
      const { elementId } = await seedElement(admin, dogId, "Down");
      const trainedOn = "2026-01-16";

      const results = await Promise.allSettled([
        toggleTrainingLog(authClient, dogId, elementId, userId, trainedOn),
        toggleTrainingLog(authClient, dogId, elementId, userId, trainedOn),
      ]);

      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      const values = results.map((r) => (r as PromiseFulfilledResult<string>).value);
      expect([...values].sort()).toEqual(["ticked", "unticked"]);

      const { count, error } = await admin
        .from("training_logs")
        .select("*", { count: "exact", head: true })
        .eq("element_id", elementId)
        .eq("trained_on", trainedOn);
      if (error) {
        throw error;
      }
      expect(count).toBeLessThanOrEqual(1);
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

  describe("competition_scores score range / quarter-point CHECK constraint", () => {
    it("rejects a score above 10 (10.1)", async () => {
      const { competitionId } = await seedCompetition(admin, dogId, classId, userId, "2026-02-01");
      const { error } = await admin
        .from("competition_scores")
        .insert({ competition_id: competitionId, exercise_id: exerciseId, account_id: userId, score: 10.1 });
      expect(error).toBeDefined();
    });

    it("rejects a score not on a quarter-point increment (5.3)", async () => {
      const { competitionId } = await seedCompetition(admin, dogId, classId, userId, "2026-02-02");
      const { error } = await admin
        .from("competition_scores")
        .insert({ competition_id: competitionId, exercise_id: exerciseId, account_id: userId, score: 5.3 });
      expect(error).toBeDefined();
    });

    it("rejects a negative score (-1)", async () => {
      const { competitionId } = await seedCompetition(admin, dogId, classId, userId, "2026-02-03");
      const { error } = await admin
        .from("competition_scores")
        .insert({ competition_id: competitionId, exercise_id: exerciseId, account_id: userId, score: -1 });
      expect(error).toBeDefined();
    });
  });

  describe("competitions unique(dog_id, class_id, competed_on) constraint", () => {
    it("rejects a second competition on the same dog+class+date", async () => {
      const competedOn = "2026-02-04";
      await seedCompetition(admin, dogId, classId, userId, competedOn);

      const { error } = await admin
        .from("competitions")
        .insert({ dog_id: dogId, class_id: classId, account_id: userId, competed_on: competedOn });
      expect(error).toBeDefined();
    });
  });

  describe("competition_scores concurrent-upsert corruption guard", () => {
    // Covers Risk #3's analog for editable-in-place scores.
    it("concurrent upserts to the same (competition_id, exercise_id) leave exactly one of the two written values", async () => {
      const { competitionId } = await seedCompetition(admin, dogId, classId, userId, "2026-02-05");

      const results = await Promise.allSettled([
        upsertCompetitionScore(authClient, competitionId, exerciseId, userId, 7),
        upsertCompetitionScore(authClient, competitionId, exerciseId, userId, 9),
      ]);

      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      const { data, error, count } = await admin
        .from("competition_scores")
        .select("score", { count: "exact" })
        .eq("competition_id", competitionId)
        .eq("exercise_id", exerciseId);
      if (error) {
        throw error;
      }
      expect(count).toBe(1);
      expect([7, 9]).toContain((data as { score: number }[])[0].score);
    });
  });
});
