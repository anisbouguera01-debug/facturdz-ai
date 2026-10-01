/**
 * Taux de TVA et produits contre PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  setProductActive,
  updateProduct,
} from "@/server/services/products";
import {
  createTaxRate,
  listTaxRates,
  setTaxRateActive,
  updateTaxRate,
} from "@/server/services/tax-rates";
import { createTenantContext, testDb, withRole } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

type T = Awaited<ReturnType<typeof createTenantContext>>;

describe("taux de TVA", () => {
  let A: T;
  let B: T;
  beforeAll(async () => {
    A = await createTenantContext("OWNER", "TA");
    B = await createTenantContext("OWNER", "TB");
  });

  it("le premier taux devient le taux par défaut ; un seul défaut à la fois", async () => {
    const t1 = await createTaxRate(A.ctx, { label: "Taux A", rate: "19" });
    expect(t1).toMatchObject({ rate: "19.00", isDefault: true });
    const t2 = await createTaxRate(A.ctx, { label: "Taux B", rate: "9,5", isDefault: true });
    expect(t2).toMatchObject({ rate: "9.50", isDefault: true });
    const rates = await listTaxRates(A.ctx);
    expect(rates.filter((r) => r.isDefault).map((r) => r.id)).toEqual([t2.id]);
  });

  it("le défaut d'une entreprise n'affecte pas celui d'une autre", async () => {
    const b = await createTaxRate(B.ctx, { label: "B défaut", rate: "19" });
    await createTaxRate(A.ctx, { label: "A nouveau défaut", rate: "7", isDefault: true });
    const bRates = await listTaxRates(B.ctx);
    expect(bRates.find((r) => r.id === b.id)?.isDefault).toBe(true);
  });

  it("refuse un doublon actif et un taux hors limites", async () => {
    await expect(createTaxRate(A.ctx, { label: "Doublon", rate: "19.00" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(createTaxRate(A.ctx, { label: "Trop", rate: "150" })).rejects.toThrow();
  });

  it("désactiver le taux par défaut retire le statut par défaut", async () => {
    const t = await createTaxRate(A.ctx, { label: "Temporaire", rate: "3", isDefault: true });
    await setTaxRateActive(A.ctx, t.id, false);
    const all = await listTaxRates(A.ctx, { includeInactive: true });
    expect(all.find((r) => r.id === t.id)).toMatchObject({ active: false, isDefault: false });
    expect((await listTaxRates(A.ctx)).some((r) => r.id === t.id)).toBe(false);
  });

  it("réservé aux rôles qui gèrent les paramètres", async () => {
    for (const role of ["ACCOUNTANT", "EMPLOYEE", "VIEWER"] as const) {
      await expect(
        createTaxRate(withRole(A.ctx, role), { label: "X", rate: "1" }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(listTaxRates(withRole(A.ctx, "VIEWER"))).resolves.toBeDefined();
  });

  it("ne touche pas aux taux d'une autre entreprise", async () => {
    const [b] = await listTaxRates(B.ctx);
    await expect(updateTaxRate(A.ctx, b.id, { label: "Piraté", rate: "1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(setTaxRateActive(A.ctx, b.id, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("produits", () => {
  let A: T;
  let B: T;
  beforeAll(async () => {
    A = await createTenantContext("OWNER", "PA");
    B = await createTenantContext("OWNER", "PB");
  });

  const base = {
    type: "PRODUCT" as const,
    name: "Ordinateur portable",
    priceHT: "85000",
    vatRate: "19",
  };

  it("exige un taux de TVA configuré par l'entreprise", async () => {
    await expect(createProduct(A.ctx, base)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { vatRate: expect.any(Array) },
    });
    await createTaxRate(A.ctx, { label: "TVA 19", rate: "19" });
    await createTaxRate(B.ctx, { label: "TVA 19", rate: "19" });
  });

  it("crée un produit avec des montants exacts et canoniques", async () => {
    const p = await createProduct(A.ctx, {
      ...base,
      priceHT: "85 000,5",
      sku: "pc-15",
      unit: "unité",
    });
    expect(p).toMatchObject({
      priceHT: "85000.50",
      vatRate: "19.00",
      sku: "PC-15",
      currency: "DZD",
      active: true,
    });
    const row = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.organizationId).toBe(A.org.id);
    expect(row.priceHT.toFixed(2)).toBe("85000.50");
  });

  it("refuse prix négatif, 3 décimales et taux non configuré", async () => {
    await expect(createProduct(A.ctx, { ...base, priceHT: "-1" })).rejects.toThrow();
    await expect(createProduct(A.ctx, { ...base, priceHT: "10.555" })).rejects.toThrow();
    await expect(createProduct(A.ctx, { ...base, vatRate: "12" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("référence unique par entreprise, réutilisable dans une autre", async () => {
    await expect(createProduct(A.ctx, { ...base, sku: "PC-15" })).rejects.toMatchObject({
      code: "CONFLICT",
      fieldErrors: { sku: expect.any(Array) },
    });
    await expect(createProduct(B.ctx, { ...base, sku: "PC-15" })).resolves.toMatchObject({
      sku: "PC-15",
    });
  });

  it("garde son taux si celui-ci est désactivé ensuite, mais un nouveau produit ne peut plus l'utiliser", async () => {
    const t = await createTaxRate(A.ctx, { label: "Ancien taux", rate: "14" });
    const p = await createProduct(A.ctx, { ...base, name: "Ancien", vatRate: "14" });
    await setTaxRateActive(A.ctx, t.id, false);
    await expect(
      updateProduct(A.ctx, p.id, { ...base, name: "Ancien renommé", vatRate: "14" }),
    ).resolves.toMatchObject({
      name: "Ancien renommé",
      vatRate: "14.00",
    });
    await expect(createProduct(A.ctx, { ...base, vatRate: "14" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("isolation : produit d'une autre entreprise introuvable", async () => {
    const { items } = await listProducts(B.ctx);
    const bId = items[0].id;
    await expect(getProduct(A.ctx, bId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateProduct(A.ctx, bId, base)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setProductActive(A.ctx, bId, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteProduct(A.ctx, bId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("seuls propriétaire et administrateur gèrent le catalogue", async () => {
    for (const role of ["ACCOUNTANT", "EMPLOYEE", "VIEWER"] as const) {
      await expect(createProduct(withRole(A.ctx, role), base)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(
      createProduct(withRole(A.ctx, "ADMIN"), { ...base, name: "Par admin" }),
    ).resolves.toBeDefined();
    await expect(listProducts(withRole(A.ctx, "VIEWER"))).resolves.toBeDefined();
  });

  it("désactivation : disparaît de la liste active, visible dans les inactifs", async () => {
    const p = await createProduct(A.ctx, { ...base, name: "Produit saisonnier" });
    await setProductActive(A.ctx, p.id, false);
    expect((await listProducts(A.ctx, { q: "saisonnier" })).total).toBe(0);
    expect((await listProducts(A.ctx, { q: "saisonnier", inactive: "1" } as never)).total).toBe(1);
  });

  it("supprime un produit inutilisé, refuse s'il figure sur une facture", async () => {
    const free = await createProduct(A.ctx, { ...base, name: "Inutilisé" });
    await deleteProduct(A.ctx, free.id);
    expect(await db.product.findUnique({ where: { id: free.id } })).toBeNull();

    const used = await createProduct(A.ctx, { ...base, name: "Facturé" });
    const inv = await db.invoice.create({
      data: { organizationId: A.org.id, customerId: A.customer.id, issueDate: new Date() },
    });
    await db.invoiceItem.create({
      data: {
        organizationId: A.org.id,
        invoiceId: inv.id,
        productId: used.id,
        position: 1,
        description: "Facturé",
        quantity: "1",
        unitPrice: "85000",
        vatRate: "19",
        subtotal: "85000",
        taxAmount: "16150",
        total: "101150",
      },
    });
    expect((await getProduct(A.ctx, used.id)).usageCount).toBe(1);
    await expect(deleteProduct(A.ctx, used.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("recherche par nom, référence ou description", async () => {
    await createProduct(A.ctx, {
      ...base,
      name: "Imprimante laser",
      sku: "IMP-01",
      description: "Noir et blanc",
    });
    expect((await listProducts(A.ctx, { q: "imp-01" })).items.map((p) => p.name)).toEqual([
      "Imprimante laser",
    ]);
    expect((await listProducts(A.ctx, { q: "noir" })).items.map((p) => p.name)).toEqual([
      "Imprimante laser",
    ]);
  });
});
