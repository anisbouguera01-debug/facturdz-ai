/**
 * Statistiques du tableau de bord : exactitude des agrégats, exclusions (brouillons,
 * annulées, paiements annulés), retard calculé, isolation et permissions.
 */
import { afterAll, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/dates";
import { cancelInvoice, createInvoice, issueInvoice } from "@/server/services/invoices";
import { recordPayment, voidPayment } from "@/server/services/payments";
import { createQuote, respondToQuote, sendQuote } from "@/server/services/quotes";
import { getDashboard } from "@/server/services/stats";
import { createTaxRate } from "@/server/services/tax-rates";
import { createTenantContext, testDb, withRole } from "./helpers";

afterAll(() => testDb().$disconnect());

type T = Awaited<ReturnType<typeof createTenantContext>>;
const today = todayISO();
const thisMonth = today.slice(0, 7);

async function setup(name: string) {
  const t = await createTenantContext("OWNER", name);
  await createTaxRate(t.ctx, { label: "TVA 19", rate: "19" });
  return t;
}
/** Facture de `ht` DA HT (TTC = ht × 1,19), émise à la date donnée. */
async function invoice(t: T, ht: string, issueDate = today, dueDate?: string) {
  const inv = await createInvoice(t.ctx, {
    customerId: t.customer.id,
    issueDate,
    dueDate,
    items: [{ description: "x", quantity: "1", unitPrice: ht, vatRate: "19" }],
  });
  await issueInvoice(t.ctx, inv.id);
  return inv.id;
}

describe("agrégats", () => {
  it("entreprise vide : tout à zéro, 12 mois", async () => {
    const t = await setup("SE");
    const d = await getDashboard(t.ctx);
    expect(d.series).toHaveLength(12);
    expect(d.series[11].month).toBe(thisMonth);
    expect(d.kpis).toMatchObject({
      invoicedThisMonth: "0.00",
      outstanding: "0.00",
      overdue: "0.00",
      overdueCount: 0,
    });
    expect(d.topCustomers).toEqual([]);
  });

  it("facturé, encaissé, impayé et retard exacts ; brouillons, annulées et paiements annulés exclus", async () => {
    const t = await setup("SA");
    const a = await invoice(t, "1000"); // 1 190
    const b = await invoice(t, "2000", addDays(today, -60), addDays(today, -30)); // 2 380, en retard
    const c = await invoice(t, "500"); // 595, annulée
    await cancelInvoice(t.ctx, c);
    await createInvoice(t.ctx, {
      customerId: t.customer.id,
      issueDate: today,
      items: [{ description: "brouillon", quantity: "1", unitPrice: "9999", vatRate: "19" }],
    });
    await recordPayment(t.ctx, {
      invoiceId: a,
      amount: "1190",
      paymentDate: today,
      method: "CASH",
    });
    const p = await recordPayment(t.ctx, {
      invoiceId: b,
      amount: "1000",
      paymentDate: today,
      method: "CHECK",
    });
    const erreur = await recordPayment(t.ctx, {
      invoiceId: b,
      amount: "300",
      paymentDate: today,
      method: "CASH",
    });
    await voidPayment(t.ctx, { paymentId: erreur.id, reason: "Erreur de saisie" });

    const d = await getDashboard(t.ctx);
    // Facturé ce mois : a seulement (b est daté d'il y a 60 jours, c annulée, brouillon exclu).
    const sixty = addDays(today, -60).slice(0, 7);
    const month = (k: string) => d.series.find((s) => s.month === k)!;
    expect(month(thisMonth).invoiced).toBe(sixty === thisMonth ? "3570.00" : "1190.00");
    expect(month(sixty).invoiced).toBe(sixty === thisMonth ? "3570.00" : "2380.00");
    expect(d.kpis.invoiced12).toBe("3570.00");
    expect(d.kpis.collectedThisMonth).toBe("2190.00"); // 1 190 + 1 000, paiement annulé exclu
    expect(p.status).toBe("PARTIALLY_PAID");
    expect(d.kpis.outstanding).toBe("1380.00"); // 2 380 - 1 000
    expect(d.kpis.outstandingCount).toBe(1);
    expect(d.kpis.overdue).toBe("1380.00");
    expect(d.kpis.overdueCount).toBe(1);
    expect(d.kpis.draftInvoices).toBe(1);
    expect(d.overdueInvoices).toHaveLength(1);
    expect(d.overdueInvoices[0].remaining).toBe("1380.00");
    expect(d.topCustomers[0]).toMatchObject({ total: "3570.00" });
    expect(d.recentPayments).toHaveLength(2);
    // Cohérence : total facturé = encaissé + impayé
    expect(Number(d.kpis.invoiced12)).toBeCloseTo(
      Number(d.kpis.collected12) + Number(d.kpis.outstanding),
      2,
    );
  });

  it("une échéance égale à aujourd'hui n'est pas en retard ; hier l'est", async () => {
    const t = await setup("SD");
    await invoice(t, "1000", today, today);
    expect((await getDashboard(t.ctx)).kpis.overdueCount).toBe(0);
    await invoice(t, "1000", addDays(today, -5), addDays(today, -1));
    expect((await getDashboard(t.ctx)).kpis.overdueCount).toBe(1);
  });

  it("devis en attente de réponse et devis acceptés à facturer", async () => {
    const t = await setup("SQ");
    const mk = () =>
      createQuote(t.ctx, {
        customerId: t.customer.id,
        issueDate: today,
        items: [{ description: "x", quantity: "1", unitPrice: "100", vatRate: "19" }],
      });
    const q1 = await mk();
    const q2 = await mk();
    await sendQuote(t.ctx, q1.id);
    await sendQuote(t.ctx, q2.id);
    await respondToQuote(t.ctx, q2.id, "ACCEPTED");
    const d = await getDashboard(t.ctx);
    expect(d.kpis).toMatchObject({ quotesAwaitingAnswer: 1, quotesToInvoice: 1 });
  });

  it("ignore les factures hors fenêtre de 12 mois pour la série", async () => {
    const t = await setup("SW");
    await invoice(t, "1000", addDays(today, -500));
    const d = await getDashboard(t.ctx);
    expect(d.kpis.invoiced12).toBe("0.00");
    expect(d.kpis.outstandingCount).toBe(1); // mais l'impayé, lui, reste dû
  });
});

describe("isolation et permissions", () => {
  it("ne compte jamais les données d'une autre entreprise", async () => {
    const a = await setup("SI1");
    const b = await setup("SI2");
    await invoice(b, "100000");
    const d = await getDashboard(a.ctx);
    expect(d.kpis.invoiced12).toBe("0.00");
    expect(d.kpis.outstanding).toBe("0.00");
    expect(d.topCustomers).toEqual([]);
  });

  it("réservé à stats:read (OWNER, ADMIN, ACCOUNTANT)", async () => {
    const t = await setup("SP");
    for (const role of ["OWNER", "ADMIN", "ACCOUNTANT"] as const)
      await expect(getDashboard(withRole(t.ctx, role))).resolves.toBeDefined();
    for (const role of ["EMPLOYEE", "VIEWER"] as const)
      await expect(getDashboard(withRole(t.ctx, role))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
  });
});
