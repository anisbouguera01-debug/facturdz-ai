/**
 * Contexte tenant et services d'organisation contre PostgreSQL.
 * Tests critiques : un utilisateur ne voit jamais une organisation dont il n'est pas
 * membre, même si sa session la désigne comme active.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createOrganization, makeSlug, switchOrganization } from "@/server/services/organizations";
import { assertPermission, resolveTenantContext } from "@/server/tenant/resolve";
import { testDb } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

let n = 0;
async function userWithSession(label = "u") {
  const id = `${Date.now().toString(36)}${n++}`;
  const user = await db.user.create({ data: { email: `${label}${id}@t.test`, name: label } });
  const session = await db.session.create({
    data: { userId: user.id, token: `tok-${id}`, expiresAt: new Date(Date.now() + 3.6e6) },
  });
  return { userId: user.id, sessionId: session.id };
}

const sessionOf = async (actor: { userId: string; sessionId: string }) => {
  const s = await db.session.findUniqueOrThrow({ where: { id: actor.sessionId } });
  return {
    userId: actor.userId,
    sessionId: actor.sessionId,
    activeOrganizationId: s.activeOrganizationId,
  };
};

describe("création d'organisation", () => {
  it("crée l'organisation, le propriétaire, les compteurs, l'audit et l'active", async () => {
    const actor = await userWithSession();
    const org = await createOrganization(db, actor, {
      name: "Société Étoile d'Oran",
      wilaya: "Oran",
    });

    expect(org.slug).toMatch(/^societe-etoile-d-oran-[a-z0-9]{1,6}$/);
    const member = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: org.id },
    });
    expect(member).toMatchObject({ userId: actor.userId, role: "OWNER" });
    expect(await db.documentSequence.count({ where: { organizationId: org.id } })).toBe(2);
    expect(
      await db.auditLog.count({
        where: { organizationId: org.id, action: "organization.created" },
      }),
    ).toBe(1);
    expect((await sessionOf(actor)).activeOrganizationId).toBe(org.id);
    // Aucune règle fiscale inventée à la création.
    expect(await db.taxRate.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("refuse des données invalides", async () => {
    const actor = await userWithSession();
    await expect(createOrganization(db, actor, { name: "x" })).rejects.toThrow();
    await expect(
      createOrganization(db, actor, { name: "Valide", email: "pas-un-email" }),
    ).rejects.toThrow();
  });

  it("ne peut pas activer l'organisation sur la session d'un autre utilisateur", async () => {
    const actor = await userWithSession();
    const other = await userWithSession();
    await expect(
      createOrganization(
        db,
        { userId: actor.userId, sessionId: other.sessionId },
        { name: "Piège" },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    // Transaction annulée : rien n'a été créé.
    expect(await db.organization.count({ where: { name: "Piège" } })).toBe(0);
  });

  it("génère des slugs uniques pour un même nom", () => {
    const slugs = new Set(Array.from({ length: 50 }, () => makeSlug("Atlas")));
    expect(slugs.size).toBe(50);
  });
});

describe("résolution du contexte tenant", () => {
  it("sans organisation : demande l'onboarding", async () => {
    const actor = await userWithSession();
    await expect(resolveTenantContext(db, await sessionOf(actor))).resolves.toEqual({
      status: "no-organization",
    });
  });

  it("ignore une organisation active dont l'utilisateur n'est pas membre (test critique n°1)", async () => {
    const alice = await userWithSession("alice");
    const bob = await userWithSession("bob");
    const orgA = await createOrganization(db, alice, { name: "Org Alice" });
    const orgB = await createOrganization(db, bob, { name: "Org Bob" });

    // Session d'Alice falsifiée pour pointer vers l'organisation de Bob.
    await db.session.update({
      where: { id: alice.sessionId },
      data: { activeOrganizationId: orgB.id },
    });
    const res = await resolveTenantContext(db, await sessionOf(alice));
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.context.organizationId).toBe(orgA.id);
    expect(res.memberships.map((m) => m.organizationId)).toEqual([orgA.id]);
    // Et le client de données ne voit que l'organisation d'Alice.
    await expect(
      res.context.db.organization.findUnique({ where: { id: orgB.id } }),
    ).resolves.toBeNull();
    // La session a été corrigée.
    expect((await sessionOf(alice)).activeOrganizationId).toBe(orgA.id);
  });

  it("perd l'accès dès que l'adhésion est retirée", async () => {
    const owner = await userWithSession();
    const employee = await userWithSession();
    const org = await createOrganization(db, owner, { name: "Org partagée" });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: employee.userId, role: "EMPLOYEE" },
    });
    await db.session.update({
      where: { id: employee.sessionId },
      data: { activeOrganizationId: org.id },
    });

    const before = await resolveTenantContext(db, await sessionOf(employee));
    expect(before.status === "ok" && before.context.role).toBe("EMPLOYEE");

    await db.organizationMember.deleteMany({
      where: { organizationId: org.id, userId: employee.userId },
    });
    await expect(resolveTenantContext(db, await sessionOf(employee))).resolves.toEqual({
      status: "no-organization",
    });
  });

  it("applique les permissions du rôle", async () => {
    expect(() => assertPermission({ role: "VIEWER" }, "invoices:create")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => assertPermission({ role: "OWNER" }, "invoices:create")).not.toThrow();
  });
});

describe("changement d'organisation", () => {
  it("autorise une organisation dont on est membre", async () => {
    const actor = await userWithSession();
    const o1 = await createOrganization(db, actor, { name: "Première" });
    const o2 = await createOrganization(db, actor, { name: "Seconde" });
    expect((await sessionOf(actor)).activeOrganizationId).toBe(o2.id);
    await switchOrganization(db, actor, o1.id);
    expect((await sessionOf(actor)).activeOrganizationId).toBe(o1.id);
  });

  it("refuse une organisation dont on n'est pas membre, sans révéler qu'elle existe", async () => {
    const alice = await userWithSession();
    const bob = await userWithSession();
    const orgB = await createOrganization(db, bob, { name: "Org privée" });
    await expect(switchOrganization(db, alice, orgB.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(switchOrganization(db, alice, "inexistante")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
