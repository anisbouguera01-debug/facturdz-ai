/**
 * Paiements contre PostgreSQL : surpaiement impossible (même en concurrence), statut et
 * montant payé toujours cohérents, annulation tracée, isolation et permissions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayISO } from "@/lib/dates";
import { cancelInvoice, createInvoice, getInvoice, issueInvoice } from "@/server/services/invoices";
import {
  listInvoicePayments,
  listPayments,
  recordPayment,
  voidPayment,
} from "@/server/services/payments";
import { createTaxRate } from "@/server/services/tax-rates";
import { createTenantContext, testDb, withRole } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

type T = Awaited<ReturnType<typeof createTenantContext>>;
let A: T;
let B: T;
const today = todayISO();

/** Facture émise de 1 000 DA HT + 19 % = 1 190,00 TTC. */
async function issued(t: T, unitPrice = "1000") {
  const inv = await createInvoice(t.ctx, {
    customerId: t.customer.id,
    issueDate: today,
    items: [{ description: "Prestation", quantity: "1", unitPrice, vatRate: "19" }],
  });
  await issueInvoice(t.ctx, inv.id);
  return inv.id;
}
const pay = (t: T, invoiceId: string, amount: string, over: Record<string, unknown> = {}) =>
  recordPayment(t.ctx, {
    invoiceId,
    amount,
    paymentDate: today,
    method: "BANK_TRANSFER",
    ...over,
  } as never);

beforeAll(async () => {
  A = await createTenantContext("OWNER", "PA");
  B = await createTenantContext("OWNER", "PB");
  await createTaxRate(A.ctx, { label: "TVA 19", rate: "19" });
  await createTaxRate(B.ctx, { label: "TVA 19", rate: "19" });
});

describe("statut et montant payé", () => {
  it("émise → payée en partie → payée, reste à payer exact", async () => {
    const id = await issued(A);
    const p1 = await pay(A, id, "500");
    expect(p1).toMatchObject({
      status: "PARTIALLY_PAID",
      amountPaid: "500.00",
      remaining: "690.00",
    });
    const p2 = await pay(A, id, "690,00");
    expect(p2).toMatchObject({ status: "PAID", amountPaid: "1190.00", remaining: "0.00" });
    const inv = await getInvoice(A.ctx, id);
    expect(inv.status).toBe("PAID");
    expect(inv.remaining).toBe("0.00");
  });

  it("calcule sans erreur de virgule flottante (0,10 + 0,20 + reste)", async () => {
    const id = await issued(A, "0.25"); // TTC = 0.30 (0.2975 arrondi par ligne)
    expect((await getInvoice(A.ctx, id)).total).toBe("0.30");
    await pay(A, id, "0.10");
    await pay(A, id, "0.20");
    expect((await getInvoice(A.ctx, id)).status).toBe("PAID");
  });

  it("refuse un surpaiement, un montant nul, négatif ou invalide, une date future", async () => {
    const id = await issued(A);
    await expect(pay(A, id, "1190.01")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { amount: expect.any(Array) },
    });
    await expect(pay(A, id, "0")).rejects.toThrow();
    await expect(pay(A, id, "-5")).rejects.toThrow();
    await expect(pay(A, id, "abc")).rejects.toThrow();
    await expect(pay(A, id, "10", { paymentDate: "2999-01-01" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(pay(A, id, "10", { method: "BITCOIN" })).rejects.toThrow();
    expect((await getInvoice(A.ctx, id)).amountPaid).toBe("0.00");
  });

  it("refuse un paiement sur un brouillon, une facture annulée ou déjà soldée", async () => {
    const draft = await createInvoice(A.ctx, {
      customerId: A.customer.id,
      issueDate: today,
      items: [{ description: "x", quantity: "1", unitPrice: "100", vatRate: "19" }],
    });
    await expect(pay(A, draft.id, "10")).rejects.toMatchObject({ code: "CONFLICT" });
    const cancelled = await issued(A);
    await cancelInvoice(A.ctx, cancelled);
    await expect(pay(A, cancelled, "10")).rejects.toMatchObject({ code: "CONFLICT" });
    const done = await issued(A);
    await pay(A, done, "1190");
    await expect(pay(A, done, "1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("une facture payée ou payée en partie ne peut plus être annulée", async () => {
    const id = await issued(A);
    await pay(A, id, "100");
    await expect(cancelInvoice(A.ctx, id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("concurrence", () => {
  it("10 paiements simultanés de 300 sur 1 190 : seuls 3 passent, jamais de surpaiement", async () => {
    const t = await createTenantContext("OWNER", "PC");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const id = await issued(t);
    const res = await Promise.allSettled(Array.from({ length: 10 }, () => pay(t, id, "300")));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const inv = await getInvoice(t.ctx, id);
    expect(inv.amountPaid).toBe("900.00");
    expect(inv.status).toBe("PARTIALLY_PAID");
    expect(await db.payment.count({ where: { invoiceId: id } })).toBe(3);
  });

  it("paiements simultanés qui soldent exactement la facture : statut PAID cohérent", async () => {
    const t = await createTenantContext("OWNER", "PD");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const id = await issued(t); // 1 190
    const res = await Promise.allSettled(
      ["190", "250", "250", "250", "250"].map((a) => pay(t, id, a)),
    );
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
    const inv = await getInvoice(t.ctx, id);
    expect(inv).toMatchObject({ status: "PAID", amountPaid: "1190.00", remaining: "0.00" });
  });
});

describe("annulation d'un paiement", () => {
  it("annule avec motif, recalcule le statut, conserve la trace", async () => {
    const id = await issued(A);
    const p1 = await pay(A, id, "400", { reference: "VIR-1" });
    await pay(A, id, "790");
    expect((await getInvoice(A.ctx, id)).status).toBe("PAID");

    const res = await voidPayment(A.ctx, { paymentId: p1.id, reason: "Virement rejeté" });
    expect(res).toMatchObject({
      status: "PARTIALLY_PAID",
      amountPaid: "790.00",
      remaining: "400.00",
    });
    const list = await listInvoicePayments(A.ctx, id);
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.id === p1.id)).toMatchObject({
      voided: true,
      voidReason: "Virement rejeté",
    });
    await expect(voidPayment(A.ctx, { paymentId: p1.id, reason: "encore" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Le reste à payer est de nouveau encaissable.
    await expect(pay(A, id, "400")).resolves.toMatchObject({ status: "PAID" });
  });

  it("toutes annulées : retour à « émise », puis la facture redevient annulable", async () => {
    const id = await issued(A);
    const p = await pay(A, id, "100");
    await voidPayment(A.ctx, { paymentId: p.id, reason: "Erreur de saisie" });
    expect((await getInvoice(A.ctx, id)).status).toBe("ISSUED");
    await expect(cancelInvoice(A.ctx, id)).resolves.toBeUndefined();
  });

  it("exige un motif", async () => {
    const id = await issued(A);
    const p = await pay(A, id, "100");
    await expect(voidPayment(A.ctx, { paymentId: p.id, reason: " " })).rejects.toThrow();
  });
});

describe("isolation entre entreprises et permissions", () => {
  it("une facture ou un paiement d'une autre entreprise est introuvable", async () => {
    const ib = await issued(B);
    const pb = await pay(B, ib, "100");
    await expect(pay(A, ib, "10")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      voidPayment(A.ctx, { paymentId: pb.id, reason: "intrusion" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listInvoicePayments(A.ctx, ib)).toEqual([]);
    expect((await listPayments(A.ctx, { pageSize: 100 })).items.some((p) => p.id === pb.id)).toBe(
      false,
    );
    expect((await getInvoice(B.ctx, ib)).amountPaid).toBe("100.00");
  });

  it("ACCOUNTANT encaisse ; EMPLOYEE et VIEWER ne le peuvent pas mais lisent selon leur rôle", async () => {
    const id = await issued(A);
    await expect(
      pay({ ...A, ctx: withRole(A.ctx, "ACCOUNTANT") }, id, "10"),
    ).resolves.toBeDefined();
    for (const role of ["EMPLOYEE", "VIEWER"] as const) {
      const c = { ...A, ctx: withRole(A.ctx, role) };
      await expect(pay(c, id, "10")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        voidPayment(c.ctx, { paymentId: "x", reason: "test test" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(listPayments(withRole(A.ctx, "EMPLOYEE"))).resolves.toBeDefined();
  });
});

describe("contraintes de base", () => {
  it("la base refuse un payé supérieur au total ou un statut incohérent", async () => {
    const id = await issued(A);
    await expect(
      db.invoice.update({ where: { id }, data: { amountPaid: "5000", status: "PARTIALLY_PAID" } }),
    ).rejects.toThrow(/invoices_paid_check/);
    await expect(
      db.invoice.update({ where: { id }, data: { status: "PAID", amountPaid: "10" } }),
    ).rejects.toThrow(/invoices_paid_check/);
    await expect(
      db.invoice.update({ where: { id }, data: { status: "PARTIALLY_PAID", amountPaid: "0" } }),
    ).rejects.toThrow(/invoices_paid_check/);
  });
});

describe("liste", () => {
  it("filtre par mode et recherche par référence, numéro ou client", async () => {
    const t = await createTenantContext("OWNER", "PL");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const id = await issued(t);
    await pay(t, id, "100", { method: "CASH", reference: "RECU-77" });
    await pay(t, id, "200", { method: "CHECK", reference: "CHQ-9" });
    expect((await listPayments(t.ctx, { method: "CASH" })).total).toBe(1);
    expect((await listPayments(t.ctx, { q: "chq-9" })).items[0].method).toBe("CHECK");
    expect((await listPayments(t.ctx, { q: t.customer.name.slice(0, 8) })).total).toBe(2);
    const inv = await getInvoice(t.ctx, id);
    expect((await listPayments(t.ctx, { q: inv.invoiceNumber! })).total).toBe(2);
  });
});
