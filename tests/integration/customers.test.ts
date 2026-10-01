/**
 * Service Clients contre PostgreSQL : isolation, permissions, recherche,
 * pagination, archivage, suppression, statistiques et audit.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  getCustomerStats,
  listCustomers,
  setCustomerArchived,
  updateCustomer,
} from "@/server/services/customers";
import { createTenantContext, testDb, withRole } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

type T = Awaited<ReturnType<typeof createTenantContext>>;
let A: T;
let B: T;

beforeAll(async () => {
  A = await createTenantContext("OWNER", "A");
  B = await createTenantContext("OWNER", "B");
  // Jeu de données de A pour la recherche et la pagination.
  for (const [name, type, wilaya] of [
    ["SARL Numidia Tech", "COMPANY", "Alger"],
    ["EURL Oasis Distribution", "COMPANY", "Oran"],
    ["Karim Benali", "INDIVIDUAL", "Oran"],
    ["SPA Cirta Industries", "COMPANY", "Constantine"],
  ] as const) {
    await createCustomer(A.ctx, {
      type,
      name,
      wilaya,
      email: `${name.split(" ")[1].toLowerCase()}@ex.dz`,
    });
  }
});

describe("création et validation", () => {
  it("crée un client, normalise les données et journalise", async () => {
    const c = await createCustomer(A.ctx, {
      type: "COMPANY",
      name: "  Atlas Négoce  ",
      email: " Contact@Atlas.DZ ",
      nif: "abc-123",
      phone: "",
    });
    expect(c).toMatchObject({
      name: "Atlas Négoce",
      email: "contact@atlas.dz",
      nif: "ABC-123",
      phone: null,
    });
    expect(await db.auditLog.count({ where: { entityId: c.id, action: "customer.created" } })).toBe(
      1,
    );
  });

  it("refuse un nom vide, un e-mail ou un téléphone invalide", async () => {
    await expect(createCustomer(A.ctx, { type: "COMPANY", name: "  " })).rejects.toThrow();
    await expect(
      createCustomer(A.ctx, { type: "COMPANY", name: "X", email: "nope" }),
    ).rejects.toThrow();
    await expect(
      createCustomer(A.ctx, { type: "COMPANY", name: "X", phone: "abc" }),
    ).rejects.toThrow();
    await expect(createCustomer(A.ctx, { type: "AUTRE" as never, name: "X" })).rejects.toThrow();
  });

  it("ignore un organizationId glissé dans les données", async () => {
    const c = await createCustomer(A.ctx, {
      type: "COMPANY",
      name: "Tentative",
      organizationId: B.org.id,
    } as never);
    const row = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.organizationId).toBe(A.org.id);
  });
});

describe("isolation entre entreprises", () => {
  it("n'expose jamais le client d'une autre entreprise", async () => {
    await expect(getCustomer(A.ctx, B.customer.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateCustomer(A.ctx, B.customer.id, { type: "COMPANY", name: "Piraté" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setCustomerArchived(A.ctx, B.customer.id, true)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteCustomer(A.ctx, B.customer.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const b = await db.customer.findUniqueOrThrow({ where: { id: B.customer.id } });
    expect(b.name).not.toBe("Piraté");
    expect(b.archivedAt).toBeNull();
  });

  it("la liste ne contient que les clients de l'entreprise", async () => {
    const list = await listCustomers(A.ctx, { pageSize: "100" } as never);
    expect(list.items.some((c) => c.id === B.customer.id)).toBe(false);
  });
});

describe("permissions", () => {
  it("VIEWER lit mais ne crée, ne modifie, n'archive ni ne supprime", async () => {
    const viewer = withRole(A.ctx, "VIEWER");
    await expect(listCustomers(viewer)).resolves.toBeDefined();
    await expect(createCustomer(viewer, { type: "COMPANY", name: "X" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      updateCustomer(viewer, A.customer.id, { type: "COMPANY", name: "X" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setCustomerArchived(viewer, A.customer.id, true)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(deleteCustomer(viewer, A.customer.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("EMPLOYEE et ACCOUNTANT créent mais ne suppriment pas", async () => {
    for (const role of ["EMPLOYEE", "ACCOUNTANT"] as const) {
      const ctx = withRole(A.ctx, role);
      await expect(
        createCustomer(ctx, { type: "COMPANY", name: `Par ${role}` }),
      ).resolves.toBeDefined();
      await expect(deleteCustomer(ctx, A.customer.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});

describe("liste : recherche, filtres, pagination", () => {
  it("recherche sans tenir compte de la casse sur nom, e-mail et wilaya", async () => {
    const byName = await listCustomers(A.ctx, { q: "numidia" });
    expect(byName.items.map((c) => c.name)).toEqual(["SARL Numidia Tech"]);
    const byWilaya = await listCustomers(A.ctx, { q: "ORAN" });
    expect(byWilaya.items.map((c) => c.name).sort()).toEqual([
      "EURL Oasis Distribution",
      "Karim Benali",
    ]);
  });

  it("filtre par type", async () => {
    const res = await listCustomers(A.ctx, { type: "INDIVIDUAL" });
    expect(res.items.every((c) => c.type === "INDIVIDUAL")).toBe(true);
    expect(res.items.length).toBeGreaterThan(0);
  });

  it("pagine côté serveur sans doublon ni oubli", async () => {
    const all = await listCustomers(A.ctx, { pageSize: 100 });
    const seen: string[] = [];
    for (let page = 1; page <= Math.ceil(all.total / 5); page++) {
      const res = await listCustomers(A.ctx, { page, pageSize: 5 });
      expect(res.items.length).toBeLessThanOrEqual(5);
      seen.push(...res.items.map((c) => c.id));
    }
    expect(new Set(seen).size).toBe(all.total);
    expect(seen.sort()).toEqual(all.items.map((c) => c.id).sort());
  });

  it("corrige les paramètres d'URL invalides au lieu d'échouer", async () => {
    const res = await listCustomers(A.ctx, {
      page: "abc",
      pageSize: "100000",
      type: "XXX",
      sort: "DROP TABLE",
    } as never);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(25);
  });
});

describe("modification, archivage, suppression", () => {
  it("modifie et efface un champ facultatif vidé", async () => {
    const c = await createCustomer(A.ctx, {
      type: "COMPANY",
      name: "Temp",
      phone: "0555 00 00 00",
    });
    const u = await updateCustomer(A.ctx, c.id, {
      type: "INDIVIDUAL",
      name: "Temp modifié",
      phone: "",
    });
    expect(u).toMatchObject({ type: "INDIVIDUAL", name: "Temp modifié", phone: null });
  });

  it("un client archivé disparaît de la liste par défaut et peut être restauré", async () => {
    const c = await createCustomer(A.ctx, { type: "COMPANY", name: "À archiver" });
    await setCustomerArchived(A.ctx, c.id, true);
    expect((await listCustomers(A.ctx, { q: "À archiver" })).total).toBe(0);
    expect((await listCustomers(A.ctx, { q: "À archiver", archived: "1" } as never)).total).toBe(1);
    await setCustomerArchived(A.ctx, c.id, false);
    expect((await listCustomers(A.ctx, { q: "À archiver" })).total).toBe(1);
  });

  it("supprime un client sans document, refuse s'il a une facture", async () => {
    const free = await createCustomer(A.ctx, { type: "COMPANY", name: "Sans facture" });
    await deleteCustomer(A.ctx, free.id);
    expect(await db.customer.findUnique({ where: { id: free.id } })).toBeNull();

    const busy = await createCustomer(A.ctx, { type: "COMPANY", name: "Avec facture" });
    await db.invoice.create({
      data: { organizationId: A.org.id, customerId: busy.id, issueDate: new Date() },
    });
    await expect(deleteCustomer(A.ctx, busy.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("statistiques", () => {
  it("additionne factures émises et paiements, sans brouillons ni annulées", async () => {
    const c = await createCustomer(A.ctx, { type: "COMPANY", name: "Client stats" });
    const base = { organizationId: A.org.id, customerId: c.id, issueDate: new Date() };
    await db.invoice.createMany({
      data: [
        {
          ...base,
          status: "ISSUED",
          invoiceNumber: `S-${c.id}-1`,
          subtotal: "1190.00",
          total: "1190.00",
          amountPaid: "0",
        },
        {
          ...base,
          status: "PARTIALLY_PAID",
          invoiceNumber: `S-${c.id}-2`,
          subtotal: "1000.10",
          total: "1000.10",
          amountPaid: "500.05",
        },
        { ...base, status: "DRAFT", subtotal: "9999.99", total: "9999.99" },
        {
          ...base,
          status: "CANCELLED",
          invoiceNumber: `S-${c.id}-3`,
          subtotal: "5000",
          total: "5000",
        },
      ],
    });
    await expect(getCustomerStats(A.ctx, c.id)).resolves.toEqual({
      invoiceCount: 2,
      totalInvoiced: "2190.10",
      totalPaid: "500.05",
      totalUnpaid: "1690.05",
    });
  });
});
