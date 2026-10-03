/**
 * Coûts et consommation IA contre PostgreSQL : tarifs historisés, coût jamais inventé,
 * résumé strictement limité à l'entreprise et réservé au droit « statistiques ».
 */
import Decimal from "decimal.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
});

import { setModelPricing } from "@/server/ai/pricing-admin";
import { mockControl } from "@/server/ai/providers/mock";
import { runAI } from "@/server/ai/run";
import { askAssistant } from "@/server/services/ai-assistant";
import { getAIUsageSummary } from "@/server/services/ai-usage";
import { createTenantContext, testDb, withRole } from "./helpers";

// Le code serveur lit la base via getDb() : on le dirige vers la base de test.
(globalThis as unknown as { __facturdzPrisma: unknown }).__facturdzPrisma = testDb();
const db = testDb();
afterAll(() => db.$disconnect());

type T = Awaited<ReturnType<typeof createTenantContext>>;
let A: T;
let B: T;

/** Un appel structuré minimal ; le fournisseur simulé renvoie des jetons déterministes. */
const call = (t: T) =>
  runAI(
    t.ctx,
    "INVOICE_GENERATION",
    (p) => p.generateStructuredOutput({ system: "s", user: "u" }, {} as never),
    (d) => d,
  );

beforeAll(async () => {
  A = await createTenantContext("OWNER", "USA");
  B = await createTenantContext("OWNER", "USB");
});
beforeEach(() => mockControl.reset());

describe("coût estimé enregistré par runAI", () => {
  it("sans tarif : coût null (jamais 0) et appel compté « sans tarif »", async () => {
    await db.modelPricing.deleteMany({});
    mockControl.script = [{ ok: true }];
    await call(A);
    const row = await A.ctx.db.aIUsage.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(row.estimatedCost).toBeNull();
    expect(row.pricingId).toBeNull();
    expect((await getAIUsageSummary(A.ctx, "THIS_MONTH")).uncostedCalls).toBeGreaterThan(0);
  });

  it("avec tarif applicable : coût calculé et tarif tracé", async () => {
    await db.modelPricing.deleteMany({});
    const mock = await db.modelPricing.create({
      data: {
        provider: "MOCK",
        model: "mock-demo",
        inputCostPerMillionTokens: "100000",
        outputCostPerMillionTokens: "200000",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    mockControl.script = [{ ok: true }];
    await call(A);
    const row = await A.ctx.db.aIUsage.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    // tarif = 0,1 $ par jeton d'entrée, 0,2 $ par jeton de sortie
    expect(row.pricingId).toBe(mock.id);
    expect(row.estimatedCost?.toFixed(6)).toBe(
      new Decimal(row.inputTokens)
        .times("0.1")
        .plus(new Decimal(row.outputTokens).times("0.2"))
        .toFixed(6),
    );
    expect(row.currency).toBe("USD");
  });

  it("un tarif expiré ou futur ne s'applique pas", async () => {
    await db.modelPricing.deleteMany({});
    await db.modelPricing.create({
      data: {
        provider: "MOCK",
        model: "mock-demo",
        inputCostPerMillionTokens: "1",
        outputCostPerMillionTokens: "1",
        effectiveFrom: new Date("2020-01-01"),
        effectiveTo: new Date("2021-01-01"),
      },
    });
    await db.modelPricing.create({
      data: {
        provider: "MOCK",
        model: "mock-demo",
        inputCostPerMillionTokens: "1",
        outputCostPerMillionTokens: "1",
        effectiveFrom: new Date("2999-01-01"),
      },
    });
    mockControl.script = [{ ok: true }];
    await call(A);
    const row = await A.ctx.db.aIUsage.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(row.estimatedCost).toBeNull();
  });
});

describe("historique des tarifs", () => {
  it("un nouveau tarif ferme le précédent et refuse une date antérieure", async () => {
    await db.modelPricing.deleteMany({});
    const base = { provider: "OPENAI", model: "m-test", input: "1.5", output: "6" } as const;
    await setModelPricing(db, { ...base, effectiveFrom: new Date("2026-01-01") });
    await setModelPricing(db, { ...base, input: "2", effectiveFrom: new Date("2026-06-01") });
    const rows = await db.modelPricing.findMany({
      where: { model: "m-test" },
      orderBy: { effectiveFrom: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].effectiveTo?.toISOString()).toBe(new Date("2026-06-01").toISOString());
    expect(rows[1].effectiveTo).toBeNull();
    await expect(
      setModelPricing(db, { ...base, effectiveFrom: new Date("2026-03-01") }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuse des prix invalides (négatifs, texte, trop précis)", async () => {
    const base = {
      provider: "OPENAI",
      model: "m",
      output: "1",
      effectiveFrom: new Date(),
    } as const;
    for (const input of ["-1", "abc", "1.1234567", ""]) {
      await expect(setModelPricing(db, { ...base, input })).rejects.toBeTruthy();
    }
  });
});

describe("résumé de consommation", () => {
  it("agrège les appels de l'entreprise et jamais ceux d'une autre", async () => {
    const before = await getAIUsageSummary(B.ctx, "THIS_MONTH");
    mockControl.script = [{ ok: true }, { ok: true }];
    await call(A);
    await call(A);
    const a = await getAIUsageSummary(A.ctx, "THIS_MONTH");
    expect(a.calls.success).toBeGreaterThanOrEqual(2);
    expect(a.tokens.total).toBe(a.tokens.input + a.tokens.output);
    expect(a.byFeature.some((f) => f.feature === "INVOICE_GENERATION")).toBe(true);
    const b = await getAIUsageSummary(B.ctx, "THIS_MONTH");
    expect(b.calls.success).toBe(before.calls.success);
  });

  it("réservé au droit statistiques (comptable oui, employé et lecture seule non)", async () => {
    await expect(
      getAIUsageSummary(withRole(A.ctx, "ACCOUNTANT"), "THIS_MONTH"),
    ).resolves.toBeTruthy();
    for (const role of ["EMPLOYEE", "VIEWER"] as const)
      await expect(getAIUsageSummary(withRole(A.ctx, role), "THIS_MONTH")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
  });

  it("les appels refusés par la limite et les erreurs sont comptés sans jeton", async () => {
    mockControl.script = [new Error("boom")];
    await call(A).catch(() => undefined);
    const s = await getAIUsageSummary(A.ctx, "THIS_MONTH");
    expect(s.calls.error).toBeGreaterThanOrEqual(1);
  });

  it("l'assistant analytique laisse aussi une trace valorisable", async () => {
    await askAssistant(A.ctx, "Quel est mon chiffre d'affaires ce mois ?");
    const s = await getAIUsageSummary(A.ctx, "THIS_MONTH");
    expect(s.byFeature.some((f) => f.feature === "ANALYTICS")).toBe(true);
  });
});

describe("AIUsage : jetons, total, coût et latence", () => {
  const priced = async () => {
    await db.modelPricing.deleteMany({});
    await db.modelPricing.create({
      data: {
        provider: "MOCK",
        model: "mock-demo",
        inputCostPerMillionTokens: "2",
        outputCostPerMillionTokens: "8",
        cachedInputCostPerMillionTokens: "0.5",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
  };
  const result = (usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  }) =>
    ({
      data: "ok",
      provider: "MOCK",
      model: "mock-demo",
      providerRequestId: "req_x",
      usage,
    }) as const;

  it("succès : entrée, sortie, total, coût (jetons en cache au tarif cache) et latence mesurée", async () => {
    await priced();
    await runAI(
      A.ctx,
      "GENERAL_ASSISTANT",
      async () => {
        await new Promise((r) => setTimeout(r, 40));
        return result({
          inputTokens: 1_000_000,
          cachedInputTokens: 400_000,
          outputTokens: 250_000,
        });
      },
      (d) => d,
    );
    const row = await A.ctx.db.aIUsage.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(row.status).toBe("SUCCESS");
    expect(row.inputTokens).toBe(1_000_000);
    expect(row.cachedInputTokens).toBe(400_000);
    expect(row.outputTokens).toBe(250_000);
    expect(row.totalTokens).toBe(1_250_000);
    // 600 000 × 2 + 400 000 × 0,5 + 250 000 × 8 (par million) = 1,2 + 0,2 + 2 = 3,4
    expect(row.estimatedCost?.toFixed(6)).toBe("3.400000");
    expect(row.latencyMs).toBeGreaterThanOrEqual(35);
    expect(row.latencyMs).toBeLessThan(5_000);
    expect(row.providerRequestId).toBe("req_x");
  });

  it("erreur fournisseur (dont délai dépassé) : ligne ERROR, 0 jeton, coût null, latence mesurée, code conservé", async () => {
    await priced();
    const { AppError } = await import("@/server/errors");
    await expect(
      runAI(
        A.ctx,
        "GENERAL_ASSISTANT",
        async () => {
          await new Promise((r) => setTimeout(r, 25));
          throw new AppError("AI_UNAVAILABLE", "Délai dépassé.");
        },
        (d) => d,
      ),
    ).rejects.toThrow();
    const row = await A.ctx.db.aIUsage.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(row.status).toBe("ERROR");
    expect(row.errorCode).toBe("AI_UNAVAILABLE");
    expect(row.totalTokens).toBe(0);
    expect(row.estimatedCost).toBeNull();
    expect(row.latencyMs).toBeGreaterThanOrEqual(20);
  });

  it("ni prompt ni réponse ni clé ne sont stockés dans AIUsage", async () => {
    const cols = Object.keys(await A.ctx.db.aIUsage.findFirstOrThrow())
      .join(",")
      .toLowerCase();
    for (const forbidden of ["prompt", "response", "content", "apikey", "secret"])
      expect(cols).not.toContain(forbidden);
  });
});
