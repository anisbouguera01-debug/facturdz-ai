/**
 * Administration de la plateforme : accès réservé au SUPER_ADMIN actif (relu en base), actions
 * validées et journalisées, vues transversales sans contenu métier.
 */
import { afterAll, describe, expect, it } from "vitest";
import { resolveAdmin, type AdminContext } from "@/server/admin/context";
import {
  setAiPricing,
  setOrganizationSubscription,
  setPlanLimit,
  setUserStatus,
  updatePlan,
} from "@/server/admin/manage";
import {
  getPlatformOverview,
  listOrganizations,
  listPlans,
  listUsers,
} from "@/server/admin/overview";
import { createTenantContext, testDb } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

let n = 0;
async function user(
  platformRole: "USER" | "SUPER_ADMIN" = "USER",
  status: "ACTIVE" | "SUSPENDED" = "ACTIVE",
) {
  return db.user.create({
    data: { email: `adm-${Date.now()}-${n++}@adm.test`, name: "U", platformRole, status },
  });
}
async function admin(): Promise<AdminContext> {
  const u = await user("SUPER_ADMIN");
  return resolveAdmin(db, { userId: u.id, ipAddress: "10.0.0.1", userAgent: "vitest" });
}
async function plan(code = `P-${Date.now()}-${n++}`) {
  return db.subscriptionPlan.create({ data: { code, name: code } });
}

describe("accès administrateur", () => {
  it("refuse un utilisateur ordinaire, un propriétaire d'entreprise et un inconnu", async () => {
    const plain = await user();
    const { user: owner } = await createTenantContext("OWNER");
    for (const id of [plain.id, owner.id, "inconnu"]) {
      await expect(resolveAdmin(db, { userId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("refuse un administrateur suspendu et relit le rôle en base à chaque appel", async () => {
    const suspended = await user("SUPER_ADMIN", "SUSPENDED");
    await expect(resolveAdmin(db, { userId: suspended.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const a = await user("SUPER_ADMIN");
    await resolveAdmin(db, { userId: a.id });
    await db.user.update({ where: { id: a.id }, data: { platformRole: "USER" } });
    await expect(resolveAdmin(db, { userId: a.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("abonnements", () => {
  it("crée puis modifie l'abonnement d'une entreprise, avec trace", async () => {
    const a = await admin();
    const { org } = await createTenantContext("OWNER");
    const p1 = await plan();
    const p2 = await plan();
    await expect(
      setOrganizationSubscription(a, { organizationId: org.id, status: "ACTIVE" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await setOrganizationSubscription(a, { organizationId: org.id, planCode: p1.code }, db);
    const res = await setOrganizationSubscription(
      a,
      { organizationId: org.id, planCode: p2.code, status: "PAST_DUE" },
      db,
    );
    expect(res).toEqual({ plan: p2.code, status: "PAST_DUE" });
    const logs = await db.auditLog.findMany({
      where: { organizationId: org.id, action: "admin.subscription_changed" },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0]!.userId).toBe(a.userId);
    expect(logs[0]!.ipAddress).toBe("10.0.0.1");
  });

  it("refuse un plan inconnu, désactivé ou une entreprise inexistante", async () => {
    const a = await admin();
    const { org } = await createTenantContext("OWNER");
    const off = await plan();
    await db.subscriptionPlan.update({ where: { id: off.id }, data: { active: false } });
    await expect(
      setOrganizationSubscription(a, { organizationId: org.id, planCode: off.code }, db),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      setOrganizationSubscription(a, { organizationId: org.id, planCode: "NOPE" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      setOrganizationSubscription(a, { organizationId: "x", planCode: off.code }, db),
    ).rejects.toBeTruthy();
  });
});

describe("plans et limites", () => {
  it("met à jour un plan et ses limites (null = illimité), avec trace", async () => {
    const a = await admin();
    const p = await plan();
    await updatePlan(
      a,
      { planId: p.id, name: "Nouveau nom", priceMonthly: "1500.50", active: true },
      db,
    );
    expect((await db.subscriptionPlan.findUniqueOrThrow({ where: { id: p.id } })).name).toBe(
      "Nouveau nom",
    );
    await setPlanLimit(a, { planId: p.id, key: "INVOICES_PER_MONTH", value: "50" }, db);
    await setPlanLimit(a, { planId: p.id, key: "INVOICES_PER_MONTH", value: null }, db);
    const lim = await db.usageLimit.findUniqueOrThrow({
      where: { planId_key: { planId: p.id, key: "INVOICES_PER_MONTH" } },
    });
    expect(lim.value).toBeNull();
    await setPlanLimit(a, { planId: p.id, key: "AI_BUDGET_USD_PER_MONTH", value: "12.50" }, db);
    expect(
      await db.auditLog.count({ where: { entityId: p.id, action: { startsWith: "admin." } } }),
    ).toBe(4);
  });

  it("rejette les valeurs invalides et la désactivation du plan FREE", async () => {
    const a = await admin();
    const p = await plan();
    for (const value of ["-1", "abc", "1.5", "1e3", ""]) {
      await expect(
        setPlanLimit(a, { planId: p.id, key: "INVOICES_PER_MONTH", value }, db),
      ).rejects.toBeTruthy();
    }
    await expect(
      updatePlan(a, { planId: p.id, name: "", priceMonthly: "1", active: true }, db),
    ).rejects.toBeTruthy();
    await expect(
      updatePlan(a, { planId: p.id, name: "x", priceMonthly: "-5", active: true }, db),
    ).rejects.toBeTruthy();
    const free = await db.subscriptionPlan.upsert({
      where: { code: "FREE" },
      update: {},
      create: { code: "FREE", name: "Gratuit" },
    });
    await expect(
      updatePlan(a, { planId: free.id, name: "Gratuit", priceMonthly: "0", active: false }, db),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("tarifs IA", () => {
  it("enregistre un tarif et le trace", async () => {
    const a = await admin();
    const row = await setAiPricing(
      a,
      {
        provider: "OPENAI",
        model: `m-${Date.now()}`,
        input: "1",
        output: "2",
        currency: "USD",
        effectiveFrom: "2026-01-01",
      },
      db,
    );
    expect(
      await db.auditLog.count({ where: { entityId: row.id, action: "admin.pricing_set" } }),
    ).toBe(1);
  });
});

describe("utilisateurs", () => {
  it("suspend (sessions supprimées), réactive, et protège admins et soi-même", async () => {
    const a = await admin();
    const target = await user();
    await db.session.create({
      data: {
        userId: target.id,
        token: `t-${Date.now()}-${n++}`,
        expiresAt: new Date(Date.now() + 1e6),
      },
    });
    await setUserStatus(a, { userId: target.id, status: "SUSPENDED" }, db);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      "SUSPENDED",
    );
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
    await setUserStatus(a, { userId: target.id, status: "ACTIVE" }, db);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("ACTIVE");
    await expect(
      setUserStatus(a, { userId: a.userId, status: "SUSPENDED" }, db),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const other = await user("SUPER_ADMIN");
    await expect(
      setUserStatus(a, { userId: other.id, status: "SUSPENDED" }, db),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await db.auditLog.count({
        where: {
          entityId: target.id,
          action: { in: ["admin.user_suspended", "admin.user_reactivated"] },
        },
      }),
    ).toBe(2);
  });
});

describe("vues transversales", () => {
  it("voient plusieurs entreprises, sans contenu métier", async () => {
    const a = await admin();
    const t1 = await createTenantContext("OWNER", "OVA");
    const t2 = await createTenantContext("OWNER", "OVB");
    const overview = await getPlatformOverview(a, db);
    expect(overview.organizations).toBeGreaterThanOrEqual(2);
    const orgs = await listOrganizations(a, { q: "OVA" }, db);
    expect(orgs.rows.map((r) => r.id)).toContain(t1.org.id);
    expect(orgs.rows.map((r) => r.id)).not.toContain(t2.org.id);
    expect(Object.keys(orgs.rows[0]!).sort()).toEqual([
      "aiCallsThisMonth",
      "createdAt",
      "id",
      "invoices",
      "members",
      "name",
      "planCode",
      "planName",
      "status",
    ]);
    const users = await listUsers(a, { q: t1.user.email }, db);
    expect(users.rows).toHaveLength(1);
    expect(JSON.stringify(users)).not.toMatch(/password|token/i);
    expect((await listPlans(a, db)).length).toBeGreaterThan(0);
  });
});
