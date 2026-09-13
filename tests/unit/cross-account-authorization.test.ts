import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDogById, softDeleteDog, setDefaultClassNumber, renameDog } from "../../src/lib/services/dogs";
import {
  getTrainingElements,
  createTrainingElement,
  renameTrainingElement,
  deleteTrainingElement,
  reorderTrainingElements,
} from "../../src/lib/services/training-elements";
import { getTrainingLogs, toggleTrainingLog } from "../../src/lib/services/training-logs";
import {
  getCompetitionsForDogClass,
  createCompetition,
  getCompetitionScores,
  upsertCompetitionScore,
  deleteCompetitionScore,
  competitionBelongsToDog,
} from "../../src/lib/services/competitions";
import {
  createAdminClient,
  createTestUser,
  seedDog,
  seedElement,
  seedCompetition,
  seedCompetitionScore,
} from "../helpers/db";

describe("cross-account authorization (Risk #4)", () => {
  let admin: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let authClientA: SupabaseClient;
  let authClientB: SupabaseClient;
  let dogAId: string;
  let elementAId: string;
  let class1Number: number;
  let class2Number: number;
  let class1Exercise1Id: string;
  let class2Exercise1Id: string;
  let cleanupA: () => Promise<void> = () => Promise.resolve();
  let cleanupB: () => Promise<void> = () => Promise.resolve();

  beforeEach(async () => {
    admin = createAdminClient();

    ({ userId: userAId, authClient: authClientA, cleanup: cleanupA } = await createTestUser(admin));
    ({ userId: userBId, authClient: authClientB, cleanup: cleanupB } = await createTestUser(admin));

    ({ dogId: dogAId } = await seedDog(admin, userAId));
    ({ elementId: elementAId } = await seedElement(admin, dogAId, "Sit"));

    class1Number = 1;
    class2Number = 2;

    const exercisesResult = await admin
      .from("exercises")
      .select("id, class_number")
      .in("class_number", [class1Number, class2Number])
      .order("sort_position", { ascending: true });
    if (exercisesResult.error) {
      throw exercisesResult.error;
    }
    const exercises = exercisesResult.data as { id: string; class_number: number }[];
    const foundClass1ExerciseId = exercises.find((e) => e.class_number === class1Number)?.id;
    const foundClass2ExerciseId = exercises.find((e) => e.class_number === class2Number)?.id;
    if (!foundClass1ExerciseId || !foundClass2ExerciseId) {
      throw new Error("Class 1 or Class 2 exercise not found");
    }
    class1Exercise1Id = foundClass1ExerciseId;
    class2Exercise1Id = foundClass2ExerciseId;
  });

  afterEach(async () => {
    await cleanupA();
    await cleanupB();
  });

  describe("dogs", () => {
    it("getDogById returns null for another account's dog", async () => {
      const result = await getDogById(authClientB, dogAId);
      expect(result).toBeNull();
    });

    it("softDeleteDog returns false for another account's dog", async () => {
      const result = await softDeleteDog(authClientB, dogAId);
      expect(result).toBe(false);
    });

    it("setDefaultClassNumber returns null for another account's dog", async () => {
      const result = await setDefaultClassNumber(authClientB, dogAId, class1Number);
      expect(result).toBeNull();
    });

    it("renameDog returns null for another account's dog", async () => {
      const result = await renameDog(authClientB, dogAId, "Renamed");
      expect(result).toBeNull();
    });
  });

  describe("training elements", () => {
    it("getTrainingElements returns [] for another account's dog", async () => {
      const result = await getTrainingElements(authClientB, dogAId);
      expect(result).toEqual([]);
    });

    it("createTrainingElement rejects when targeting another account's dog", async () => {
      await expect(createTrainingElement(authClientB, dogAId, "New Element")).rejects.toBeDefined();
    });

    it("renameTrainingElement returns null for another account's element", async () => {
      const result = await renameTrainingElement(authClientB, dogAId, elementAId, "Renamed");
      expect(result).toBeNull();
    });

    it("deleteTrainingElement returns false for another account's element", async () => {
      const result = await deleteTrainingElement(authClientB, dogAId, elementAId);
      expect(result).toBe(false);
    });

    it("reorderTrainingElements is a no-op when targeting another account's dog", async () => {
      const { data: insertedElements, error: insertError } = await admin
        .from("training_elements")
        .insert([
          { dog_id: dogAId, name: "Element One", sort_position: 1 },
          { dog_id: dogAId, name: "Element Two", sort_position: 2 },
        ])
        .select("id, sort_position")
        .order("sort_position", { ascending: true });

      if (insertError) {
        throw insertError;
      }

      const elementId1 = insertedElements[0].id as string;
      const elementId2 = insertedElements[1].id as string;

      await reorderTrainingElements(authClientB, dogAId, [elementId2, elementId1]);

      const { data: afterElements, error: afterError } = await admin
        .from("training_elements")
        .select("id, sort_position")
        .in("id", [elementId1, elementId2])
        .order("sort_position", { ascending: true });

      if (afterError) {
        throw afterError;
      }

      const posById = Object.fromEntries(
        (afterElements as { id: string; sort_position: number }[]).map((e) => [e.id, e.sort_position]),
      );
      expect(posById[elementId1]).toBe(1);
      expect(posById[elementId2]).toBe(2);
    });
  });

  describe("training logs", () => {
    it("getTrainingLogs returns [] for another account's dog", async () => {
      const result = await getTrainingLogs(authClientB, dogAId, "2026-01-01", "2026-12-31");
      expect(result).toEqual([]);
    });

    it("toggleTrainingLog rejects when targeting another account's dog", async () => {
      await expect(toggleTrainingLog(authClientB, dogAId, elementAId, userBId, "2026-01-15")).rejects.toBeDefined();
    });
  });

  describe("competitions", () => {
    it("getCompetitionsForDogClass returns [] for another account's dog", async () => {
      await seedCompetition(admin, dogAId, class1Number, userAId, "2026-01-01");
      const result = await getCompetitionsForDogClass(authClientB, dogAId, class1Number, null, "2026-12-31");
      expect(result).toEqual([]);
    });

    it("createCompetition rejects when targeting another account's dog", async () => {
      await expect(createCompetition(authClientB, dogAId, class1Number, userBId, "2026-01-02")).rejects.toBeDefined();
    });
  });

  describe("competition_scores", () => {
    it("getCompetitionScores returns [] for another account's competitions", async () => {
      const { competitionId } = await seedCompetition(admin, dogAId, class1Number, userAId, "2026-01-03");
      await seedCompetitionScore(admin, competitionId, class1Exercise1Id, userAId, 8);

      const result = await getCompetitionScores(authClientB, [competitionId]);
      expect(result).toEqual([]);
    });

    it("upsertCompetitionScore rejects when targeting another account's competition", async () => {
      const { competitionId } = await seedCompetition(admin, dogAId, class1Number, userAId, "2026-01-04");

      await expect(
        upsertCompetitionScore(authClientB, competitionId, class1Exercise1Id, userBId, 6),
      ).rejects.toBeDefined();
    });

    it("upsertCompetitionScore rejects when exerciseId belongs to a different class than the competition's class", async () => {
      const { competitionId } = await seedCompetition(admin, dogAId, class1Number, userAId, "2026-01-05");

      await expect(
        upsertCompetitionScore(authClientA, competitionId, class2Exercise1Id, userAId, 6),
      ).rejects.toBeDefined();
    });

    it("deleteCompetitionScore does not delete another account's score", async () => {
      const { competitionId } = await seedCompetition(admin, dogAId, class1Number, userAId, "2026-01-06");
      await seedCompetitionScore(admin, competitionId, class1Exercise1Id, userAId, 7);

      await deleteCompetitionScore(authClientB, competitionId, class1Exercise1Id);

      const { count, error } = await admin
        .from("competition_scores")
        .select("*", { count: "exact", head: true })
        .eq("competition_id", competitionId)
        .eq("exercise_id", class1Exercise1Id);
      if (error) {
        throw error;
      }
      expect(count).toBe(1);
    });

    it("competitionBelongsToDog returns false for another account's competition", async () => {
      const { competitionId } = await seedCompetition(admin, dogAId, class1Number, userAId, "2026-01-07");
      const result = await competitionBelongsToDog(authClientB, dogAId, competitionId);
      expect(result).toBe(false);
    });
  });
});
