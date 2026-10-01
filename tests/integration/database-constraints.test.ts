/**
 * Garanties apportées par la base elle-même (indépendamment du code applicatif).
 * Couvre au niveau PostgreSQL les tests critiques n°2 (client d'une autre
 * organisation) et n°3 (numéro de facture unique).
 */
import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@/server/db/client";
import { createOrgFixture, testDb } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

const issueDate = new Date("2026-10-01");

function draftInvoice(organizationId: string, customerId: string, extra: object = {}) {
  return db.invoice.create({ data: { organizationId, customerId, issueDate, ...extra } });
}

describe("isolation multi-tenant par clés étrangères composites", () => {
  it("refuse une facture liée au client d'une autre organisation", async () => {
    const a = await createOrgFixture("A");
    const b = await createOrgFixture("B");
    await expect(draftInvoice(a.org.id, b.customer.id)).rejects.toMatchObject({ code: "P2003" });
  });

  it("refuse une ligne de facture avec le produit d'une autre organisation", async () => {
    const a = await createOrgFixture("A");
    const b = await createOrgFixture("B");
    const invoice = await draftInvoice(a.org.id, a.customer.id);
    await expect(
      db.invoiceItem.create({
        data: {
          organizationId: a.org.id,
          invoiceId: invoice.id,
          productId: b.product.id,
          position: 1,
          description: "x",
          quantity: "1",
          unitPrice: "1000",
          vatRate: "19",
          subtotal: "1000",
          taxAmount: "190",
          total: "1190",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("refuse un paiement rattaché à la facture d'une autre organisation", async () => {
    const a = await createOrgFixture("A");
    const b = await createOrgFixture("B");
    const invoiceB = await draftInvoice(b.org.id, b.customer.id, {
      status: "ISSUED",
      invoiceNumber: "FAC-2026-000001",
    });
    await expect(
      db.payment.create({
        data: {
          organizationId: a.org.id,
          invoiceId: invoiceB.id,
          amount: "100",
          paymentDate: issueDate,
          method: "CASH",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

describe("numérotation des factures", () => {
  it("refuse deux factures avec le même numéro dans une organisation", async () => {
    const a = await createOrgFixture("A");
    const issued = { status: "ISSUED", invoiceNumber: "FAC-2026-000042" } as const;
    await draftInvoice(a.org.id, a.customer.id, issued);
    await expect(draftInvoice(a.org.id, a.customer.id, issued)).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("autorise le même numéro dans deux organisations différentes", async () => {
    const a = await createOrgFixture("A");
    const b = await createOrgFixture("B");
    const issued = { status: "ISSUED", invoiceNumber: "FAC-2026-000001" } as const;
    await draftInvoice(a.org.id, a.customer.id, issued);
    await expect(draftInvoice(b.org.id, b.customer.id, issued)).resolves.toBeDefined();
  });

  it("autorise plusieurs brouillons sans numéro", async () => {
    const a = await createOrgFixture("A");
    await draftInvoice(a.org.id, a.customer.id);
    await expect(draftInvoice(a.org.id, a.customer.id)).resolves.toBeDefined();
  });

  it("interdit un brouillon numéroté et une facture émise sans numéro", async () => {
    const a = await createOrgFixture("A");
    await expect(
      draftInvoice(a.org.id, a.customer.id, { invoiceNumber: "FAC-2026-000099" }),
    ).rejects.toThrow(/invoices_number_status_check/);
    await expect(draftInvoice(a.org.id, a.customer.id, { status: "ISSUED" })).rejects.toThrow(
      /invoices_number_status_check/,
    );
  });
});

describe("contraintes CHECK sur les montants", () => {
  it("refuse un paiement nul ou négatif", async () => {
    const a = await createOrgFixture("A");
    const inv = await draftInvoice(a.org.id, a.customer.id, {
      status: "ISSUED",
      invoiceNumber: "FAC-2026-000500",
    });
    for (const amount of ["0", "-10"]) {
      await expect(
        db.payment.create({
          data: {
            organizationId: a.org.id,
            invoiceId: inv.id,
            amount,
            paymentDate: issueDate,
            method: "CASH",
          },
        }),
      ).rejects.toThrow(/payments_amount_check/);
    }
  });

  it("refuse un taux de TVA hors de 0–100 et un prix négatif", async () => {
    const a = await createOrgFixture("A");
    await expect(
      db.product.create({
        data: { organizationId: a.org.id, name: "x", priceHT: "10", vatRate: "120" },
      }),
    ).rejects.toThrow(/products_vatRate_check/);
    await expect(
      db.product.create({
        data: { organizationId: a.org.id, name: "x", priceHT: "-1", vatRate: "19" },
      }),
    ).rejects.toThrow(/products_priceHT_check/);
  });
});

describe("précision des montants", () => {
  it("stocke les décimaux exactement (aucune erreur de virgule flottante)", async () => {
    const a = await createOrgFixture("A");
    const sum = new Prisma.Decimal("0.1").plus("0.2"); // 0.30000000000000004 en float
    const p = await db.product.create({
      data: { organizationId: a.org.id, name: "précision", priceHT: sum, vatRate: "19" },
    });
    expect(p.priceHT.toFixed(2)).toBe("0.30");
    expect(p.priceHT.equals("0.3")).toBe(true);
    const big = await db.product.create({
      data: { organizationId: a.org.id, name: "gros", priceHT: "999999999999.99", vatRate: "19" },
    });
    expect(big.priceHT.toFixed(2)).toBe("999999999999.99");
  });
});

describe("suppressions", () => {
  it("empêche de supprimer un client qui a des factures", async () => {
    const a = await createOrgFixture("A");
    await draftInvoice(a.org.id, a.customer.id);
    await expect(db.customer.delete({ where: { id: a.customer.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("supprime proprement une organisation et toutes ses données", async () => {
    const a = await createOrgFixture("A");
    const inv = await draftInvoice(a.org.id, a.customer.id, {
      status: "ISSUED",
      invoiceNumber: "FAC-2026-000777",
    });
    await db.payment.create({
      data: {
        organizationId: a.org.id,
        invoiceId: inv.id,
        amount: "50",
        paymentDate: issueDate,
        method: "CASH",
      },
    });
    await db.organization.delete({ where: { id: a.org.id } });
    const remaining = await Promise.all([
      db.customer.count({ where: { organizationId: a.org.id } }),
      db.invoice.count({ where: { organizationId: a.org.id } }),
      db.payment.count({ where: { organizationId: a.org.id } }),
      db.product.count({ where: { organizationId: a.org.id } }),
    ]);
    expect(remaining).toEqual([0, 0, 0, 0]);
  });
});
