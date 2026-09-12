import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getExercisesForClass } from "../../src/lib/services/competition";
import { createAdminClient, createAnonClient, createTestUser } from "../helpers/db";
import { COMPETITION_CLASSES } from "../../src/const";

const EXPECTED_EXERCISE_COUNTS: Record<number, number> = {
  1: 9,
  2: 10,
  3: 10,
};

describe("COMPETITION_CLASSES", () => {
  it("has exactly 3 entries, ordered Class 1 -> Class 2 -> Class 3", () => {
    expect(COMPETITION_CLASSES).toEqual([
      { class_number: 1, name: "Class 1", sort_position: 1 },
      { class_number: 2, name: "Class 2", sort_position: 2 },
      { class_number: 3, name: "Class 3", sort_position: 3 },
    ]);
  });
});

describe("competition reference data", () => {
  let admin: SupabaseClient;
  let authClient: SupabaseClient;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    admin = createAdminClient();
    ({ authClient, cleanup } = await createTestUser(admin));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("seeded data counts", () => {
    it("each class has the spec'd exercise count (9 / 10 / 10 = 29 total)", async () => {
      for (const cls of COMPETITION_CLASSES) {
        const { count, error } = await admin
          .from("exercises")
          .select("*", { count: "exact", head: true })
          .eq("class_number", cls.class_number);
        if (error) {
          throw error;
        }
        expect(count).toBe(EXPECTED_EXERCISE_COUNTS[cls.class_number]);
      }

      const { count: totalCount, error: totalError } = await admin
        .from("exercises")
        .select("*", { count: "exact", head: true });
      if (totalError) {
        throw totalError;
      }
      expect(totalCount).toBe(29);
    });
  });

  describe("spot-checked values via service functions", () => {
    it("Heelwork has multiplier 4 in all three classes", async () => {
      for (const cls of COMPETITION_CLASSES) {
        const exercises = await getExercisesForClass(authClient, cls.class_number);
        const heelwork = exercises.find((e) => e.name === "Heelwork");
        expect(heelwork?.multiplier).toBe(4);
      }
    });

    it("Class 1's Distance control has multiplier 4", async () => {
      const exercises = await getExercisesForClass(authClient, 1);
      const distanceControl = exercises.find((e) => e.name === "Distance control");
      expect(distanceControl?.multiplier).toBe(4);
    });

    it("Class 2's 9th exercise (Send around cones, stop and jump) has shortcut '3.8'", async () => {
      const exercises = await getExercisesForClass(authClient, 2);
      const exercise9 = exercises.find((e) => e.sort_position === 9);
      expect(exercise9?.name).toBe("Send around cones, stop and jump");
      expect(exercise9?.shortcut).toBe("3.8");
    });
  });

  describe("getExercisesForClass", () => {
    it("returns Class 1's 9 exercises for class_number 1", async () => {
      const exercises = await getExercisesForClass(authClient, 1);
      expect(exercises).toHaveLength(9);
    });

    it("returns [] for an unrecognized class_number", async () => {
      const exercises = await getExercisesForClass(authClient, 99);
      expect(exercises).toEqual([]);
    });
  });

  describe("RLS boundary", () => {
    it("anon client cannot read exercises", async () => {
      const anonClient = createAnonClient();
      const { error } = await anonClient.from("exercises").select("*");

      expect(error).toBeDefined();
    });

    it("authenticated client reads all 3 classes and 29 exercises", async () => {
      let totalExercises = 0;
      for (const cls of COMPETITION_CLASSES) {
        const exercises = await getExercisesForClass(authClient, cls.class_number);
        totalExercises += exercises.length;
      }
      expect(totalExercises).toBe(29);
    });
  });
});
