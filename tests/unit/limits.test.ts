import { describe, expect, it } from "vitest";
import { monthBounds } from "@/server/services/limits";

describe("bornes du mois (heure d'Alger)", () => {
  it("milieu de mois", () => {
    const { from, to } = monthBounds("2026-10-15");
    expect(from.toISOString()).toBe("2026-09-30T23:00:00.000Z"); // 1er octobre 00:00 à Alger (UTC+1)
    expect(to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
  it("décembre : fin de période au 1er janvier suivant", () => {
    const { from, to } = monthBounds("2026-12-31");
    expect(from.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
  it("février d'une année non bissextile", () => {
    const { from, to } = monthBounds("2027-02-10");
    expect(to.getTime() - from.getTime()).toBe(28 * 24 * 3600 * 1000);
  });
});
