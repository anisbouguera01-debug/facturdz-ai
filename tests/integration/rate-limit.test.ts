import { afterAll, describe, expect, it } from "vitest";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { testDb } from "./helpers";

(globalThis as unknown as { __facturdzPrisma: unknown }).__facturdzPrisma = testDb();
afterAll(() => testDb().$disconnect());

describe("limiteur de débit", () => {
  it("laisse passer jusqu'au plafond puis refuse (RATE_LIMITED), avec le message fourni", async () => {
    const id = `t-${Date.now()}`;
    const now = new Date();
    for (let i = 0; i < 3; i++) await consumeRateLimit("test", id, 3, 60, now);
    await expect(consumeRateLimit("test", id, 3, 60, now, "Stop.")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Stop.",
    });
  });

  it("repart à zéro à la fenêtre suivante et isole les identifiants", async () => {
    const id = `u-${Date.now()}`;
    const now = new Date();
    await consumeRateLimit("test", id, 1, 60, now);
    await consumeRateLimit("test", `${id}-autre`, 1, 60, now);
    await consumeRateLimit("test", id, 1, 60, new Date(now.getTime() + 61_000));
  });

  it("tient le plafond sous concurrence", async () => {
    const id = `c-${Date.now()}`;
    const now = new Date();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => consumeRateLimit("test", id, 4, 60, now)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
  });
});
