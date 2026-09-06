import { describe, expect, it } from "vitest";
import { resetPasswordSchema } from "../../src/lib/schemas/auth";

describe("resetPasswordSchema", () => {
  it("accepts valid matching passwords", () => {
    const result = resetPasswordSchema.safeParse({ password: "secret6", confirmPassword: "secret6" });
    expect(result.success).toBe(true);
  });

  it("rejects a too-short password", () => {
    const result = resetPasswordSchema.safeParse({ password: "abc", confirmPassword: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched confirmation", () => {
    const result = resetPasswordSchema.safeParse({ password: "secret6", confirmPassword: "different" });
    expect(result.success).toBe(false);
  });
});
