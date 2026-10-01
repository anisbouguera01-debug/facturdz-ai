/**
 * Client tenant (forTenant) contre PostgreSQL : chaque tentative d'accès à une
 * autre organisation doit échouer. Test critique n°1 au niveau données.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forTenant, TenantScopeError } from "@/server/db/tenant";
import { createOrgFixture, testDb } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

let A: Awaited<ReturnType<typeof createOrgFixture>>;
let B: Awaited<ReturnType<typeof createOrgFixture>>;
let tA: ReturnType<typeof forTenant>;

beforeAll(async () => {
  A = await createOrgFixture("A");
  B = await createOrgFixture("B");
  tA = forTenant(db, A.org.id);
});

describe("lectures", () => {
  it("findMany ne renvoie que les données de l'organisation", async () => {
    const customers = await tA.customer.findMany();
    expect(customers.length).toBeGreaterThan(0);
    expect(customers.every((c) => c.organizationId === A.org.id)).toBe(true);
  });

  it("ignore un filtre organizationId contradictoire passé par l'appelant", async () => {
    const res = await tA.customer.findMany({ where: { organizationId: B.org.id } });
    expect(res).toEqual([]);
  });

  it("findUnique sur l'identifiant d'une autre organisation renvoie null", async () => {
    await expect(tA.customer.findUnique({ where: { id: B.customer.id } })).resolves.toBeNull();
    await expect(
      tA.customer.findUniqueOrThrow({ where: { id: B.customer.id } }),
    ).rejects.toMatchObject({ code: "P2025" });
  });

  it("count et aggregate ignorent les autres organisations", async () => {
    const total = await db.product.count();
    const mine = await tA.product.count();
    expect(mine).toBeLessThan(total);
    const agg = await tA.product.aggregate({ _count: true });
    expect(agg._count).toBe(mine);
  });
});

describe("écritures", () => {
  it("impose l'organisation courante à la création", async () => {
    const c = await tA.customer.create({ data: { name: "Créé via tenant" } as never });
    expect(c.organizationId).toBe(A.org.id);
  });

  it("refuse une création pour une autre organisation", async () => {
    await expect(
      tA.customer.create({ data: { organizationId: B.org.id, name: "Intrus" } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    await expect(
      tA.customer.create({
        data: { name: "Intrus", organization: { connect: { id: B.org.id } } } as never,
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    await expect(
      tA.customer.createMany({ data: [{ organizationId: B.org.id, name: "Intrus" }] }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("ne peut pas modifier ni supprimer un enregistrement d'une autre organisation", async () => {
    await expect(
      tA.customer.update({ where: { id: B.customer.id }, data: { name: "Piraté" } }),
    ).rejects.toMatchObject({ code: "P2025" });
    await expect(tA.customer.delete({ where: { id: B.customer.id } })).rejects.toMatchObject({
      code: "P2025",
    });
    const res = await tA.customer.updateMany({
      where: { id: B.customer.id },
      data: { name: "Piraté" },
    });
    expect(res.count).toBe(0);
    const still = await db.customer.findUniqueOrThrow({ where: { id: B.customer.id } });
    expect(still.name).not.toBe("Piraté");
  });

  it("interdit de déplacer un enregistrement vers une autre organisation", async () => {
    await expect(
      tA.customer.update({ where: { id: A.customer.id }, data: { organizationId: B.org.id } }),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("upsert ne peut ni lire ni écraser une autre organisation", async () => {
    await expect(
      tA.product.upsert({
        where: { id: B.product.id },
        update: { name: "Piraté" },
        create: { name: "Nouveau", priceHT: "10", vatRate: "19" } as never,
      }),
    ).resolves.toMatchObject({ organizationId: A.org.id, name: "Nouveau" });
    const b = await db.product.findUniqueOrThrow({ where: { id: B.product.id } });
    expect(b.name).not.toBe("Piraté");
  });
});

describe("modèles hors tenant", () => {
  it("refuse l'accès aux tables globales", async () => {
    await expect(tA.user.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(tA.session.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(tA.subscriptionPlan.findMany()).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("ne donne accès qu'à sa propre organisation", async () => {
    await expect(tA.organization.findUnique({ where: { id: B.org.id } })).resolves.toBeNull();
    await expect(tA.organization.findFirst()).resolves.toMatchObject({ id: A.org.id });
    await expect(tA.organization.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(tA.organization.delete({ where: { id: A.org.id } })).rejects.toBeInstanceOf(
      TenantScopeError,
    );
    await expect(
      tA.organization.update({ where: { id: B.org.id }, data: { name: "Piraté" } }),
    ).rejects.toMatchObject({ code: "P2025" });
  });
});
