import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getCompetitionClasses,
  getExercisesForClass,
  getExercisesForClassNumber,
} from "../../src/lib/services/competition";
import { createAdminClient, createAnonClient, createTestUser } from "../helpers/db";

const EXPECTED_EXERCISE_COUNTS: Record<string, number> = {
  "Class 1": 9,
  "Class 2": 10,
  "Class 3": 10,
};

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
    it("competition_classes has exactly 3 rows, ordered Class 1 -> Class 2 -> Class 3", async () => {
      const { data, error } = await admin
        .from("competition_classes")
        .select("name, sort_position")
        .order("sort_position", { ascending: true });
      if (error) {
        throw error;
      }

      expect(data).toEqual([
        { name: "Class 1", sort_position: 1 },
        { name: "Class 2", sort_position: 2 },
        { name: "Class 3", sort_position: 3 },
      ]);
    });

    it("each class has the spec'd exercise count (9 / 10 / 10 = 29 total)", async () => {
      const { data: classes, error: classesError } = await admin
        .from("competition_classes")
        .select("id, name")
        .order("sort_position", { ascending: true });
      if (classesError) {
        throw classesError;
      }

      for (const cls of classes as { id: string; name: string }[]) {
        const { count, error } = await admin
          .from("exercises")
          .select("*", { count: "exact", head: true })
          .eq("class_id", cls.id);
        if (error) {
          throw error;
        }
        expect(count).toBe(EXPECTED_EXERCISE_COUNTS[cls.name]);
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
      const classes = await getCompetitionClasses(authClient);
      expect(classes).toHaveLength(3);

      for (const cls of classes) {
        const exercises = await getExercisesForClass(authClient, cls.id);
        const heelwork = exercises.find((e) => e.name === "Heelwork");
        expect(heelwork?.multiplier).toBe(4);
      }
    });

    it("Class 1's Distance control has multiplier 4", async () => {
      const classes = await getCompetitionClasses(authClient);
      const class1 = classes.find((c) => c.name === "Class 1");
      if (!class1) {
        throw new Error("Class 1 not found");
      }

      const exercises = await getExercisesForClass(authClient, class1.id);
      const distanceControl = exercises.find((e) => e.name === "Distance control");
      expect(distanceControl?.multiplier).toBe(4);
    });

    it("Class 2's 9th exercise (Send around cones, stop and jump) has shortcut '3.8'", async () => {
      const classes = await getCompetitionClasses(authClient);
      const class2 = classes.find((c) => c.name === "Class 2");
      if (!class2) {
        throw new Error("Class 2 not found");
      }

      const exercises = await getExercisesForClass(authClient, class2.id);
      const exercise9 = exercises.find((e) => e.sort_position === 9);
      expect(exercise9?.name).toBe("Send around cones, stop and jump");
      expect(exercise9?.shortcut).toBe("3.8");
    });
  });

  describe("getExercisesForClassNumber", () => {
    it("returns Class 1's 9 exercises for class_number 1", async () => {
      const exercises = await getExercisesForClassNumber(authClient, 1);
      expect(exercises).toHaveLength(9);
    });

    it("returns null when no class has the given class_number", async () => {
      const exercises = await getExercisesForClassNumber(authClient, 99);
      expect(exercises).toBeNull();
    });
  });

  describe("RLS boundary", () => {
    it("anon client cannot read competition_classes", async () => {
      const anonClient = createAnonClient();
      const { error } = await anonClient.from("competition_classes").select("*");

      // REVOKE SELECT ... FROM anon is a table-privilege revoke, so PostgREST
      // deterministically returns a permission-denied error — never a silent [].
      expect(error).toBeDefined();
    });

    it("anon client cannot read exercises", async () => {
      const anonClient = createAnonClient();
      const { error } = await anonClient.from("exercises").select("*");

      expect(error).toBeDefined();
    });

    it("authenticated client reads all 3 classes and 29 exercises", async () => {
      const classes = await getCompetitionClasses(authClient);
      expect(classes).toHaveLength(3);

      let totalExercises = 0;
      for (const cls of classes) {
        const exercises = await getExercisesForClass(authClient, cls.id);
        totalExercises += exercises.length;
      }
      expect(totalExercises).toBe(29);
    });
  });
});
