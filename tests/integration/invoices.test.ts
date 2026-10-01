/**
 * Factures contre PostgreSQL : calculs serveur, émission numérotée, verrouillage,
 * annulation, conversion de devis, isolation entre entreprises et permissions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/dates";
import {
  cancelInvoice,
  createInvoice,
  createInvoiceFromQuote,
  deleteInvoice,
  getInvoice,
  issueInvoice,
  listInvoices,
  updateInvoice,
} from "@/server/services/invoices";
import { createQuote, getQuote, respondToQuote, sendQuote } from "@/server/services/quotes";
import { createTaxRate } from "@/server/services/tax-rates";
import { createTenantContext, testDb, withRole } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

type T = Awaited<ReturnType<typeof createTenantContext>>;
let A: T;
let B: T;

const today = todayISO();
const year = today.slice(0, 4);
const line = (over: Record<string, string> = {}) => ({
  description: "Ordinateur portable",
  quantity: "10",
  unitPrice: "85000",
  vatRate: "19",
  ...over,
});
const draft = (t: T, over: Record<string, unknown> = {}) =>
  createInvoice(t.ctx, {
    customerId: t.customer.id,
    issueDate: today,
    items: [line()],
    ...over,
  } as never);

async function acceptedQuote(t: T) {
  const q = await createQuote(t.ctx, {
    customerId: t.customer.id,
    issueDate: today,
    notes: "Note du devis",
    terms: "Paiement à 30 jours",
    items: [line(), line({ description: "Imprimante", quantity: "5", unitPrice: "25000" })],
  } as never);
  await sendQuote(t.ctx, q.id);
  await respondToQuote(t.ctx, q.id, "ACCEPTED");
  return q;
}

beforeAll(async () => {
  A = await createTenantContext("OWNER", "IA");
  B = await createTenantContext("OWNER", "IB");
  await createTaxRate(A.ctx, { label: "TVA 19", rate: "19" });
  await createTaxRate(B.ctx, { label: "TVA 19", rate: "19" });
});

describe("calcul côté serveur (test critique n°4)", () => {
  it("calcule l'exemple du cahier des charges et ignore les montants du client", async () => {
    const inv = await draft(A, {
      total: "1",
      subtotal: "1",
      items: [
        { ...line(), total: "1", subtotal: "1" },
        line({ description: "Imprimante", quantity: "5", unitPrice: "25000" }),
      ],
    });
    expect(inv).toMatchObject({
      subtotal: "975000.00",
      taxTotal: "185250.00",
      total: "1160250.00",
    });
    const full = await getInvoice(A.ctx, inv.id);
    expect(full.status).toBe("DRAFT");
    expect(full.invoiceNumber).toBeNull();
    expect(full.amountPaid).toBe("0.00");
    expect(full.remaining).toBe("1160250.00");
    const sum = full.items.reduce((a, i) => a + Number(i.total) * 100, 0);
    expect(sum).toBe(Number(full.total) * 100);
  });

  it("refuse les dates incohérentes, un taux non configuré et une facture vide", async () => {
    await expect(draft(A, { dueDate: addDays(today, -1) })).rejects.toThrow();
    await expect(draft(A, { items: [line({ vatRate: "7" })] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(draft(A, { items: [] })).rejects.toThrow();
  });
});

describe("isolation entre entreprises (test critique n°2)", () => {
  it("refuse le client ou le produit d'une autre entreprise", async () => {
    await expect(draft(A, { customerId: B.customer.id })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(draft(A, { items: [line({ productId: B.product.id })] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("une facture d'une autre entreprise est introuvable pour toute opération", async () => {
    const ib = await draft(B);
    await expect(getInvoice(A.ctx, ib.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(issueInvoice(A.ctx, ib.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelInvoice(A.ctx, ib.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteInvoice(A.ctx, ib.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateInvoice(A.ctx, ib.id, { customerId: A.customer.id, issueDate: today, items: [line()] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listInvoices(A.ctx, { pageSize: 100 })).items.some((i) => i.id === ib.id)).toBe(
      false,
    );
    expect((await getInvoice(B.ctx, ib.id)).status).toBe("DRAFT");
  });

  it("un devis d'une autre entreprise ne peut pas être converti", async () => {
    const qb = await acceptedQuote(B);
    await expect(createInvoiceFromQuote(A.ctx, qb.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getQuote(B.ctx, qb.id)).status).toBe("ACCEPTED");
  });
});

describe("cycle de vie", () => {
  it("brouillon modifiable → émise (numéro, snapshots) → verrouillée", async () => {
    const inv = await draft(A);
    await updateInvoice(A.ctx, inv.id, {
      customerId: A.customer.id,
      issueDate: today,
      dueDate: addDays(today, 30),
      terms: "30 jours",
      items: [line({ quantity: "2" })],
    });
    const edited = await getInvoice(A.ctx, inv.id);
    expect(edited.total).toBe("202300.00");
    expect(edited.paymentTerms).toBe("30 jours");

    const { number } = await issueInvoice(A.ctx, inv.id);
    expect(number).toMatch(new RegExp(`^FAC-${year}-\\d{6}$`));
    const issued = await getInvoice(A.ctx, inv.id);
    expect(issued.status).toBe("ISSUED");
    expect(issued.invoiceNumber).toBe(number);
    expect(issued.issuedAt).toBeInstanceOf(Date);
    expect(issued.sellerSnapshot?.name).toBe(A.org.name);
    expect(issued.customerParty.name).toBe(A.customer.name);

    await expect(issueInvoice(A.ctx, inv.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateInvoice(A.ctx, inv.id, {
        customerId: A.customer.id,
        issueDate: today,
        items: [line()],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deleteInvoice(A.ctx, inv.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("les coordonnées figées ne changent plus quand le client est modifié ensuite", async () => {
    const t = await createTenantContext("OWNER", "IS");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const inv = await draft(t);
    await issueInvoice(t.ctx, inv.id);
    await t.ctx.db.customer.update({
      where: { id: t.customer.id },
      data: { name: "Nouveau nom" },
    });
    const after = await getInvoice(t.ctx, inv.id);
    expect(after.customerParty.name).toBe(t.customer.name);
    expect(after.customer.name).toBe("Nouveau nom");
  });

  it("supprime un brouillon", async () => {
    const inv = await draft(A);
    await deleteInvoice(A.ctx, inv.id);
    await expect(getInvoice(A.ctx, inv.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("annule une facture émise sans la supprimer ; le numéro reste occupé", async () => {
    const t = await createTenantContext("OWNER", "IC");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const first = await draft(t);
    const { number } = await issueInvoice(t.ctx, first.id);
    await cancelInvoice(t.ctx, first.id);
    const c = await getInvoice(t.ctx, first.id);
    expect(c.status).toBe("CANCELLED");
    expect(c.invoiceNumber).toBe(number);
    expect(c.cancelledAt).toBeInstanceOf(Date);
    await expect(cancelInvoice(t.ctx, first.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const second = await draft(t);
    expect((await issueInvoice(t.ctx, second.id)).number).toBe(`FAC-${year}-000002`);
  });

  it("n'annule pas un brouillon, ni une facture déjà encaissée", async () => {
    const d = await draft(A);
    await expect(cancelInvoice(A.ctx, d.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const inv = await draft(A);
    await issueInvoice(A.ctx, inv.id);
    await db.invoice.update({
      where: { id: inv.id },
      data: { amountPaid: "100", status: "PARTIALLY_PAID" },
    });
    await expect(cancelInvoice(A.ctx, inv.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("numérotation des factures (test critique n°3)", () => {
  it("25 émissions simultanées : numéros uniques et consécutifs", async () => {
    const t = await createTenantContext("OWNER", "IN");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const drafts = await Promise.all(Array.from({ length: 25 }, () => draft(t)));
    const results = await Promise.all(drafts.map((d) => issueInvoice(t.ctx, d.id)));
    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(25);
    expect(numbers).toEqual(
      Array.from({ length: 25 }, (_, i) => `FAC-${year}-${String(i + 1).padStart(6, "0")}`),
    );
  });

  it("deux émissions simultanées de la même facture : une seule réussit", async () => {
    const t = await createTenantContext("OWNER", "ID");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const inv = await draft(t);
    const res = await Promise.allSettled([
      issueInvoice(t.ctx, inv.id),
      issueInvoice(t.ctx, inv.id),
      issueInvoice(t.ctx, inv.id),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Aucun numéro perdu : la prochaine facture reçoit le numéro 2.
    const next = await draft(t);
    expect((await issueInvoice(t.ctx, next.id)).number).toBe(`FAC-${year}-000002`);
  });

  it("chaque entreprise a sa propre séquence", async () => {
    const ib = await draft(B);
    expect((await issueInvoice(B.ctx, ib.id)).number).toMatch(/^FAC-\d{4}-\d{6}$/);
    const t = await createTenantContext("OWNER", "IQ");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const it1 = await draft(t);
    expect((await issueInvoice(t.ctx, it1.id)).number).toBe(`FAC-${year}-000001`);
  });
});

describe("conversion d'un devis accepté", () => {
  it("copie lignes et totaux, passe le devis à « facturé », une seule fois", async () => {
    const q = await acceptedQuote(A);
    const quote = await getQuote(A.ctx, q.id);
    const { id } = await createInvoiceFromQuote(A.ctx, q.id);
    const inv = await getInvoice(A.ctx, id);
    expect(inv.status).toBe("DRAFT");
    expect(inv.quote?.id).toBe(q.id);
    expect(inv.customer.id).toBe(A.customer.id);
    expect(inv.total).toBe(quote.total);
    expect(inv.total).toBe("1160250.00");
    expect(inv.notes).toBe("Note du devis");
    expect(inv.paymentTerms).toBe("Paiement à 30 jours");
    expect(inv.items.map((i) => [i.description, i.total])).toEqual(
      quote.items.map((i) => [i.description, i.total]),
    );
    expect((await getQuote(A.ctx, q.id)).status).toBe("CONVERTED");
    expect((await getQuote(A.ctx, q.id)).invoice?.id).toBe(id);

    await expect(createInvoiceFromQuote(A.ctx, q.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuse un devis brouillon, envoyé ou refusé", async () => {
    const d = await createQuote(A.ctx, {
      customerId: A.customer.id,
      issueDate: today,
      items: [line()],
    } as never);
    await expect(createInvoiceFromQuote(A.ctx, d.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await sendQuote(A.ctx, d.id);
    await expect(createInvoiceFromQuote(A.ctx, d.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await respondToQuote(A.ctx, d.id, "REJECTED");
    await expect(createInvoiceFromQuote(A.ctx, d.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("10 conversions simultanées du même devis : une seule facture créée", async () => {
    const t = await createTenantContext("OWNER", "IV");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const q = await acceptedQuote(t);
    const res = await Promise.allSettled(
      Array.from({ length: 10 }, () => createInvoiceFromQuote(t.ctx, q.id)),
    );
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.invoice.count({ where: { quoteId: q.id } })).toBe(1);
  });
});

describe("permissions", () => {
  it("VIEWER lit seulement", async () => {
    const viewer = withRole(A.ctx, "VIEWER");
    await expect(listInvoices(viewer)).resolves.toBeDefined();
    await expect(draft({ ...A, ctx: viewer })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("EMPLOYEE crée et modifie des brouillons mais n'émet, n'annule ni ne supprime", async () => {
    const employee = withRole(A.ctx, "EMPLOYEE");
    const inv = await createInvoice(employee, {
      customerId: A.customer.id,
      issueDate: today,
      items: [line()],
    });
    await expect(
      updateInvoice(employee, inv.id, {
        customerId: A.customer.id,
        issueDate: today,
        items: [line({ quantity: "3" })],
      }),
    ).resolves.toBeDefined();
    await expect(issueInvoice(employee, inv.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelInvoice(employee, inv.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteInvoice(employee, inv.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ACCOUNTANT émet et annule mais ne supprime pas ; OWNER supprime un brouillon", async () => {
    const acc = withRole(A.ctx, "ACCOUNTANT");
    const inv = await draft(A);
    await expect(issueInvoice(acc, inv.id)).resolves.toBeDefined();
    await expect(cancelInvoice(acc, inv.id)).resolves.toBeUndefined();
    const d = await draft(A);
    await expect(deleteInvoice(acc, d.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteInvoice(A.ctx, d.id)).resolves.toBeUndefined();
  });
});

describe("liste", () => {
  it("filtre par statut dont « en retard » calculé, recherche par numéro ou client", async () => {
    const t = await createTenantContext("OWNER", "IL");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const late = await draft(t, { issueDate: "2025-01-01", dueDate: "2025-01-31" });
    const ok = await draft(t, { dueDate: addDays(today, 30) });
    const paid = await draft(t);
    await draft(t);
    await issueInvoice(t.ctx, late.id);
    const { number } = await issueInvoice(t.ctx, ok.id);
    await issueInvoice(t.ctx, paid.id);
    await db.invoice.update({
      where: { id: paid.id },
      data: { status: "PAID", amountPaid: "1011500" },
    });

    const overdue = await listInvoices(t.ctx, { status: "OVERDUE" });
    expect(overdue.items.map((i) => i.id)).toEqual([late.id]);
    expect(overdue.items[0].displayStatus).toBe("OVERDUE");
    // « Émise » exclut la facture en retard (statut calculé) et la payée.
    expect((await listInvoices(t.ctx, { status: "ISSUED" })).items.map((i) => i.id)).toEqual([
      ok.id,
    ]);
    expect((await listInvoices(t.ctx, { status: "PAID" })).items.map((i) => i.id)).toEqual([
      paid.id,
    ]);
    expect((await listInvoices(t.ctx, { status: "DRAFT" })).total).toBe(1);
    expect((await listInvoices(t.ctx, { q: number })).items.map((i) => i.id)).toEqual([ok.id]);
    expect((await listInvoices(t.ctx, { q: t.customer.name.slice(0, 8) })).total).toBe(4);
  });
});
