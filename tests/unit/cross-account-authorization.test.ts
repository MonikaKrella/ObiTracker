import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDogById, softDeleteDog } from "../../src/lib/services/dogs";
import {
  getTrainingElements,
  createTrainingElement,
  renameTrainingElement,
  deleteTrainingElement,
  reorderTrainingElements,
} from "../../src/lib/services/training-elements";
import { getTrainingLogs, toggleTrainingLog } from "../../src/lib/services/training-logs";
import { createAdminClient, createTestUser, seedDog, seedElement } from "../helpers/db";

describe("cross-account authorization (Risk #4)", () => {
  let admin: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let authClientB: SupabaseClient;
  let dogAId: string;
  let elementAId: string;
  let cleanupA: () => Promise<void> = () => Promise.resolve();
  let cleanupB: () => Promise<void> = () => Promise.resolve();

  beforeEach(async () => {
    admin = createAdminClient();

    ({ userId: userAId, cleanup: cleanupA } = await createTestUser(admin));
    ({ userId: userBId, authClient: authClientB, cleanup: cleanupB } = await createTestUser(admin));

    ({ dogId: dogAId } = await seedDog(admin, userAId));
    ({ elementId: elementAId } = await seedElement(admin, dogAId, "Sit"));
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
});
