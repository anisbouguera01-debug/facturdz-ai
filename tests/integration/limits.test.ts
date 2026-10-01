/**
 * Plans et limites contre PostgreSQL : plafonds mensuels appliqués dans la transaction (même en
 * concurrence), quotas IA tracés sans appel au fournisseur, abonnement résilié, isolation.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_PROVIDER = "mock";
});

import { todayISO } from "@/lib/dates";
import { mockControl } from "@/server/ai/providers/mock";
import { runAI } from "@/server/ai/run";
import { assertWithinLimit, getUsageOverview, type LimitKeyId } from "@/server/services/limits";
import { cancelInvoice, createInvoice, getInvoice, issueInvoice } from "@/server/services/invoices";
import { recordPayment } from "@/server/services/payments";
import { createQuote } from "@/server/services/quotes";
import { createTaxRate } from "@/server/services/tax-rates";
import { createTenantContext, testDb, withRole } from "./helpers";

(globalThis as unknown as { __facturdzPrisma: unknown }).__facturdzPrisma = testDb();
const db = testDb();
afterAll(() => db.$disconnect());
beforeEach(() => mockControl.reset());

type T = Awaited<ReturnType<typeof createTenantContext>>;
let seq = 0;

/** Entreprise abonnée à un plan de test aux limites données (absente = illimité). */
async function tenant(
  limits: Partial<Record<LimitKeyId, number | null>>,
  status: "ACTIVE" | "CANCELLED" | "PAST_DUE" | "TRIALING" = "ACTIVE",
  subscribe = true,
): Promise<T> {
  const t = await createTenantContext("OWNER", "LIM");
  await createTaxRate(t.ctx, { label: "TVA 19", rate: "19" });
  if (subscribe) {
    const plan = await db.subscriptionPlan.create({
      data: { code: `T-${Date.now()}-${seq++}`, name: "Plan test" },
    });
    await db.usageLimit.createMany({
      data: Object.entries(limits).map(([key, value]) => ({
        planId: plan.id,
        key: key as LimitKeyId,
        value: value === null ? null : String(value),
      })),
    });
    await db.subscription.create({
      data: {
        organizationId: t.org.id,
        planId: plan.id,
        status,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 864e5),
      },
    });
  }
  return t;
}

const draft = (t: T) =>
  createInvoice(t.ctx, {
    customerId: t.customer.id,
    issueDate: todayISO(),
    items: [{ description: "x", quantity: "1", unitPrice: "1000", vatRate: "19" }],
  });
const quote = (t: T) =>
  createQuote(t.ctx, {
    customerId: t.customer.id,
    issueDate: todayISO(),
    items: [{ description: "x", quantity: "1", unitPrice: "1000", vatRate: "19" }],
  });
const aiCall = (t: T) =>
  runAI(
    t.ctx,
    "INVOICE_GENERATION",
    (p) => p.generateStructuredOutput({ system: "s", user: "u" }, {} as never),
    (d) => d,
  );

describe("factures émises par mois", () => {
  it("refuse au-delà du plafond, sans consommer de numéro ni toucher au brouillon", async () => {
    const t = await tenant({ INVOICES_PER_MONTH: 2 });
    const ids = await Promise.all([draft(t), draft(t), draft(t)].map((p) => p.then((d) => d.id)));
    await issueInvoice(t.ctx, ids[0]);
    await issueInvoice(t.ctx, ids[1]);
    await expect(issueInvoice(t.ctx, ids[2])).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    const third = await getInvoice(t.ctx, ids[2]);
    expect(third.status).toBe("DRAFT");
    expect(third.invoiceNumber).toBeNull();
    const seqRow = await db.documentSequence.findFirstOrThrow({
      where: { organizationId: t.org.id, documentType: "INVOICE" },
    });
    expect(seqRow.nextValue).toBe(3); // numéros 1 et 2 attribués, 3 non consommé
  });

  it("les brouillons ne comptent pas ; une facture annulée compte (numéro consommé)", async () => {
    const t = await tenant({ INVOICES_PER_MONTH: 1 });
    for (let i = 0; i < 4; i++) await draft(t); // brouillons illimités
    const a = await draft(t);
    await issueInvoice(t.ctx, a.id);
    await cancelInvoice(t.ctx, a.id);
    const b = await draft(t);
    await expect(issueInvoice(t.ctx, b.id)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("les factures émises un autre mois ne comptent pas", async () => {
    const t = await tenant({ INVOICES_PER_MONTH: 1 });
    const old = await draft(t);
    await issueInvoice(t.ctx, old.id);
    await db.invoice.update({
      where: { id: old.id },
      data: { issuedAt: new Date(Date.now() - 40 * 864e5) },
    });
    const next = await draft(t);
    await expect(issueInvoice(t.ctx, next.id)).resolves.toBeTruthy();
  });

  it("en concurrence : exactement le plafond est émis, numéros sans trou", async () => {
    const t = await tenant({ INVOICES_PER_MONTH: 3 });
    const ids = await Promise.all(Array.from({ length: 7 }, () => draft(t).then((d) => d.id)));
    const results = await Promise.allSettled(ids.map((id) => issueInvoice(t.ctx, id)));
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter(
      (r) => r.status === "rejected" && (r.reason as { code?: string }).code === "LIMIT_EXCEEDED",
    );
    expect(ok).toHaveLength(3);
    expect(refused).toHaveLength(4);
    const numbers = (await t.ctx.db.invoice.findMany({ where: { status: "ISSUED" } }))
      .map((i) => i.invoiceNumber!)
      .sort();
    expect(numbers.map((n) => Number(n.split("-").at(-1)))).toEqual([1, 2, 3]);
  });
});

describe("devis par mois", () => {
  it("refuse au-delà du plafond, aussi en concurrence", async () => {
    const t = await tenant({ QUOTES_PER_MONTH: 2 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => quote(t)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await t.ctx.db.quote.count()).toBe(2);
    await expect(quote(t)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });
});

describe("quotas IA", () => {
  it("bloque au plafond de requêtes sans appeler le fournisseur, et le trace", async () => {
    const t = await tenant({ AI_REQUESTS_PER_MONTH: 2 });
    mockControl.script = [{ a: 1 }, { a: 2 }];
    await aiCall(t);
    await aiCall(t);
    mockControl.script = [{ a: 3 }];
    const before = mockControl.requests.length;
    await expect(aiCall(t)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(mockControl.requests.length).toBe(before); // aucun appel fournisseur
    const rejected = await t.ctx.db.aIUsage.findMany({ where: { status: "REJECTED_LIMIT" } });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].errorCode).toBe("LIMIT_EXCEEDED");
    // les refus ne comptent pas dans le quota
    await expect(aiCall(t)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(await t.ctx.db.aIUsage.count({ where: { status: "SUCCESS" } })).toBe(2);
  });

  it("bloque au plafond de jetons", async () => {
    const t = await tenant({ AI_TOKENS_PER_MONTH: 1 });
    mockControl.script = [{ a: 1 }];
    await aiCall(t); // consomme plus d'un jeton
    await expect(aiCall(t)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });

  it("bloque au plafond de budget (coût estimé en USD)", async () => {
    await db.modelPricing.deleteMany({});
    await db.modelPricing.create({
      data: {
        provider: "MOCK",
        model: "mock-demo",
        inputCostPerMillionTokens: "500000",
        outputCostPerMillionTokens: "500000",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    const t = await tenant({ AI_BUDGET_USD_PER_MONTH: 1 });
    mockControl.script = [{ a: 1 }];
    await aiCall(t); // plusieurs dizaines de dollars au tarif ci-dessus
    await expect(aiCall(t)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await db.modelPricing.deleteMany({});
  });

  it("plan illimité (valeur nulle) : jamais de blocage", async () => {
    const t = await tenant({ AI_REQUESTS_PER_MONTH: null });
    for (let i = 0; i < 5; i++) {
      mockControl.script = [{ i }];
      await aiCall(t);
    }
  });
});

describe("abonnement et cas particuliers", () => {
  it("résilié : émission, devis et IA refusés ; consultation et paiements restent possibles", async () => {
    const t = await tenant({}, "ACTIVE");
    const inv = await draft(t);
    await issueInvoice(t.ctx, inv.id);
    await db.subscription.update({
      where: { organizationId: t.org.id },
      data: { status: "CANCELLED" },
    });

    const next = await draft(t); // un brouillon reste possible
    await expect(issueInvoice(t.ctx, next.id)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(quote(t)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(aiCall(t)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect((await getInvoice(t.ctx, inv.id)).status).toBe("ISSUED");
    await expect(
      recordPayment(t.ctx, {
        invoiceId: inv.id,
        amount: "100",
        paymentDate: todayISO(),
        method: "CASH",
      } as never),
    ).resolves.toBeTruthy();
  });

  it("essai et paiement en retard restent actifs", async () => {
    for (const status of ["TRIALING", "PAST_DUE"] as const) {
      const t = await tenant({ QUOTES_PER_MONTH: 5 }, status);
      await expect(quote(t)).resolves.toBeTruthy();
    }
  });

  it("sans abonnement : aucune limite appliquée (anomalie journalisée)", async () => {
    const t = await tenant({}, "ACTIVE", false);
    for (let i = 0; i < 3; i++) await quote(t);
  });

  it("chaque entreprise a ses propres compteurs", async () => {
    const a = await tenant({ QUOTES_PER_MONTH: 1 });
    const b = await tenant({ QUOTES_PER_MONTH: 1 });
    await quote(a);
    await expect(quote(a)).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(quote(b)).resolves.toBeTruthy();
  });

  it("limite d'utilisateurs : prête pour l'ajout de membres", async () => {
    const t = await tenant({ MEMBERS: 1 });
    await expect(assertWithinLimit(t.ctx.db, "MEMBERS")).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
    });
    const roomy = await tenant({ MEMBERS: 2 });
    await expect(assertWithinLimit(roomy.ctx.db, "MEMBERS")).resolves.toBeUndefined();
  });

  it("le message d'erreur nomme le plan et la limite", async () => {
    const t = await tenant({ QUOTES_PER_MONTH: 0 });
    await expect(quote(t)).rejects.toThrow(/Plan test.*devis créés par mois \(0\)/);
  });
});

describe("page Abonnement (données)", () => {
  it("réservée aux rôles « paramètres » ; reflète plan, usage et plafonds", async () => {
    const t = await tenant({ QUOTES_PER_MONTH: 5, AI_REQUESTS_PER_MONTH: null });
    await quote(t);
    const o = await getUsageOverview(t.ctx);
    expect(o.plan).toMatchObject({ name: "Plan test", status: "ACTIVE" });
    const q = o.rows.find((r) => r.key === "QUOTES_PER_MONTH")!;
    expect(q).toMatchObject({ used: "1", limit: 5 });
    expect(o.rows.find((r) => r.key === "AI_REQUESTS_PER_MONTH")!.limit).toBeNull();
    expect(o.rows.find((r) => r.key === "STORAGE_MB")!.used).toBeNull();
    for (const role of ["ACCOUNTANT", "EMPLOYEE", "VIEWER"] as const)
      await expect(getUsageOverview(withRole(t.ctx, role))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
  });
});
