/**
 * Devis et numérotation contre PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/dates";
import { allocateNumber } from "@/server/services/numbering";
import {
  createQuote,
  deleteQuote,
  duplicateQuote,
  getQuote,
  listQuotes,
  respondToQuote,
  sendQuote,
  updateQuote,
} from "@/server/services/quotes";
import { createTaxRate } from "@/server/services/tax-rates";
import { createTenantContext, testDb, withRole } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

type T = Awaited<ReturnType<typeof createTenantContext>>;
let A: T;
let B: T;

const today = todayISO();
const line = (over: Record<string, string> = {}) => ({
  description: "Ordinateur portable",
  quantity: "10",
  unitPrice: "85000",
  vatRate: "19",
  ...over,
});
const draft = (t: T, over: Record<string, unknown> = {}) =>
  createQuote(t.ctx, {
    customerId: t.customer.id,
    issueDate: today,
    items: [line()],
    ...over,
  } as never);

beforeAll(async () => {
  A = await createTenantContext("OWNER", "QA");
  B = await createTenantContext("OWNER", "QB");
  await createTaxRate(A.ctx, { label: "TVA 19", rate: "19" });
  await createTaxRate(A.ctx, { label: "TVA 9", rate: "9" });
  await createTaxRate(B.ctx, { label: "TVA 19", rate: "19" });
});

describe("calcul côté serveur", () => {
  it("calcule l'exemple du cahier des charges et stocke des montants cohérents", async () => {
    const q = await draft(A, {
      items: [line(), line({ description: "Imprimante", quantity: "5", unitPrice: "25000" })],
    });
    expect(q).toMatchObject({ subtotal: "975000.00", taxTotal: "185250.00", total: "1160250.00" });
    const full = await getQuote(A.ctx, q.id);
    expect(full.items.map((i) => [i.position, i.subtotal, i.taxAmount, i.total])).toEqual([
      [1, "850000.00", "161500.00", "1011500.00"],
      [2, "125000.00", "23750.00", "148750.00"],
    ]);
    expect(full.status).toBe("DRAFT");
    expect(full.number).toBeNull();
  });

  it("ignore les montants envoyés par le client (test critique n°4)", async () => {
    const q = await draft(A, {
      total: "1",
      subtotal: "1",
      taxTotal: "0",
      items: [{ ...line(), subtotal: "1", taxAmount: "0", total: "1" }],
    });
    expect(q.total).toBe("1011500.00");
    const row = await db.quote.findUniqueOrThrow({ where: { id: q.id }, include: { items: true } });
    expect(row.total.toFixed(2)).toBe("1011500.00");
    expect(row.items[0].total.toFixed(2)).toBe("1011500.00");
  });

  it("applique les remises de ligne", async () => {
    const q = await draft(A, { items: [line({ discountRate: "10" })] });
    const full = await getQuote(A.ctx, q.id);
    expect(full.discountTotal).toBe("85000.00");
    expect(full.subtotal).toBe("765000.00");
    expect(full.total).toBe("910350.00");
  });
});

describe("validation", () => {
  it("refuse un taux de TVA non configuré, une ligne vide, des dates incohérentes", async () => {
    await expect(draft(A, { items: [line({ vatRate: "7" })] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { "items.0.vatRate": expect.any(Array) },
    });
    await expect(draft(A, { items: [] })).rejects.toThrow();
    await expect(draft(A, { expiryDate: addDays(today, -1) })).rejects.toThrow();
    await expect(draft(A, { issueDate: "2026-02-30" })).rejects.toThrow();
  });

  it("refuse le client ou le produit d'une autre entreprise (test critique n°2)", async () => {
    await expect(draft(A, { customerId: B.customer.id })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(draft(A, { items: [line({ productId: B.product.id })] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { "items.0.productId": expect.any(Array) },
    });
    expect(
      await db.quote.count({ where: { customerId: B.customer.id, organizationId: A.org.id } }),
    ).toBe(0);
  });

  it("accepte le taux propre d'un produit de l'entreprise", async () => {
    // Le produit de la fixture est à 19 % : accepté via le produit même sans passer par la liste.
    await expect(draft(A, { items: [line({ productId: A.product.id })] })).resolves.toBeDefined();
  });

  it("refuse un total qui dépasse la capacité de stockage", async () => {
    await expect(
      draft(A, { items: [line({ quantity: "999999999", unitPrice: "999999999999.99" })] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("cycle de vie", () => {
  it("brouillon → envoyé (numéro) → accepté ; modifications et suppression interdites après envoi", async () => {
    const q = await draft(A);
    await updateQuote(A.ctx, q.id, {
      customerId: A.customer.id,
      issueDate: today,
      items: [line({ quantity: "2" })],
    });
    expect((await getQuote(A.ctx, q.id)).total).toBe("202300.00");

    const { number } = await sendQuote(A.ctx, q.id);
    expect(number).toMatch(new RegExp(`^DEV-${today.slice(0, 4)}-\\d{6}$`));
    await expect(sendQuote(A.ctx, q.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateQuote(A.ctx, q.id, { customerId: A.customer.id, issueDate: today, items: [line()] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deleteQuote(A.ctx, q.id)).rejects.toMatchObject({ code: "CONFLICT" });

    await respondToQuote(A.ctx, q.id, "ACCEPTED");
    expect((await getQuote(A.ctx, q.id)).status).toBe("ACCEPTED");
    await expect(respondToQuote(A.ctx, q.id, "REJECTED")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("un brouillon ne peut être ni accepté ni refusé", async () => {
    const q = await draft(A);
    await expect(respondToQuote(A.ctx, q.id, "ACCEPTED")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("supprime un brouillon", async () => {
    const q = await draft(A);
    await deleteQuote(A.ctx, q.id);
    await expect(getQuote(A.ctx, q.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("duplique en brouillon daté d'aujourd'hui avec la même validité", async () => {
    const q = await draft(A, { issueDate: "2026-01-10", expiryDate: "2026-02-09" });
    await sendQuote(A.ctx, q.id);
    const copy = await duplicateQuote(A.ctx, q.id);
    const c = await getQuote(A.ctx, copy.id);
    expect(c.status).toBe("DRAFT");
    expect(c.number).toBeNull();
    expect(c.issueDate.toISOString().slice(0, 10)).toBe(today);
    expect(c.expiryDate?.toISOString().slice(0, 10)).toBe(addDays(today, 30));
    expect(c.total).toBe((await getQuote(A.ctx, q.id)).total);
  });
});

describe("numérotation", () => {
  it("numéros uniques et consécutifs sous 25 envois simultanés", async () => {
    const t = await createTenantContext("OWNER", "QN");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const drafts = await Promise.all(Array.from({ length: 25 }, () => draft(t)));
    const results = await Promise.all(drafts.map((d) => sendQuote(t.ctx, d.id)));
    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(25);
    const year = today.slice(0, 4);
    expect(numbers).toEqual(
      Array.from({ length: 25 }, (_, i) => `DEV-${year}-${String(i + 1).padStart(6, "0")}`),
    );
  });

  it("numérotation par année de la date du document, préfixe repris du compteur existant", async () => {
    const t = await createTenantContext("OWNER", "QY");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    await db.documentSequence.create({
      data: {
        organizationId: t.org.id,
        documentType: "QUOTE",
        year: 2025,
        prefix: "DV",
        padding: 4,
        nextValue: 42,
      },
    });
    const old = await draft(t, { issueDate: "2025-12-31" });
    const fresh = await draft(t, { issueDate: "2026-01-01" });
    expect((await sendQuote(t.ctx, old.id)).number).toBe("DV-2025-0042");
    expect((await sendQuote(t.ctx, fresh.id)).number).toBe("DV-2026-0001");
  });

  it("une transaction annulée ne consomme pas de numéro (pas de trou)", async () => {
    const t = await createTenantContext("OWNER", "QR");
    await expect(
      t.ctx.db.$transaction(async (tx) => {
        await allocateNumber(tx, t.org.id, "INVOICE", "2026-05-01");
        throw new Error("échec simulé après réservation");
      }),
    ).rejects.toThrow("échec simulé");
    const n = await t.ctx.db.$transaction((tx) =>
      allocateNumber(tx, t.org.id, "INVOICE", "2026-05-01"),
    );
    expect(n).toBe("FAC-2026-000001");
  });

  it("chaque entreprise a sa propre séquence", async () => {
    const qa = await draft(A);
    const qb = await draft(B);
    const nb = (await sendQuote(B.ctx, qb.id)).number;
    expect(nb).toBe(`DEV-${today.slice(0, 4)}-000001`);
    await expect(sendQuote(A.ctx, qa.id)).resolves.toBeDefined();
  });
});

describe("isolation et permissions", () => {
  it("devis d'une autre entreprise introuvable pour toute opération", async () => {
    const qb = await draft(B);
    await expect(getQuote(A.ctx, qb.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(sendQuote(A.ctx, qb.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteQuote(A.ctx, qb.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateQuote(A.ctx, qb.id, { customerId: A.customer.id, issueDate: today, items: [line()] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listQuotes(A.ctx, { pageSize: 100 })).items.some((q) => q.id === qb.id)).toBe(
      false,
    );
  });

  it("VIEWER lit seulement ; EMPLOYEE crée et envoie mais ne supprime pas", async () => {
    const viewer = withRole(A.ctx, "VIEWER");
    await expect(listQuotes(viewer)).resolves.toBeDefined();
    await expect(
      createQuote(viewer, { customerId: A.customer.id, issueDate: today, items: [line()] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const employee = withRole(A.ctx, "EMPLOYEE");
    const q = await createQuote(employee, {
      customerId: A.customer.id,
      issueDate: today,
      items: [line()],
    });
    await expect(deleteQuote(employee, q.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendQuote(employee, q.id)).resolves.toBeDefined();
  });
});

describe("liste", () => {
  it("filtre par statut, y compris « expiré » calculé, et recherche par numéro ou client", async () => {
    const t = await createTenantContext("OWNER", "QL");
    await createTaxRate(t.ctx, { label: "TVA", rate: "19" });
    const expired = await draft(t, { issueDate: "2025-01-01", expiryDate: "2025-01-31" });
    const valid = await draft(t, { expiryDate: addDays(today, 30) });
    await draft(t);
    await sendQuote(t.ctx, expired.id);
    const { number } = await sendQuote(t.ctx, valid.id);

    const exp = await listQuotes(t.ctx, { status: "EXPIRED" });
    expect(exp.items.map((q) => q.id)).toEqual([expired.id]);
    expect(exp.items[0].displayStatus).toBe("EXPIRED");
    expect((await listQuotes(t.ctx, { status: "SENT" })).items.map((q) => q.id)).toEqual([
      valid.id,
    ]);
    expect((await listQuotes(t.ctx, { status: "DRAFT" })).total).toBe(1);
    expect((await listQuotes(t.ctx, { q: number })).items.map((q) => q.id)).toEqual([valid.id]);
    expect((await listQuotes(t.ctx, { q: t.customer.name.slice(0, 8) })).total).toBe(3);
  });
});
