import "server-only";
import { getDb, type Db } from "@/server/db/client";
import type { AdminContext } from "./context";

/**
 * Vues d'administration de la plateforme (lecture seule, transversales aux entreprises).
 *
 * Confidentialité : l'administrateur voit des COMPTEURS et des métadonnées d'exploitation
 * (entreprises, utilisateurs, plans, consommation IA). Il ne lit jamais le contenu métier des
 * entreprises (clients, lignes de facture, montants, prompts IA) : aucune de ces requêtes ne
 * sélectionne ces données.
 */
const ALGIERS = "+01:00";

export function currentMonthStart(now = new Date()): Date {
  const algiers = new Date(now.getTime() + 60 * 60 * 1000);
  const y = algiers.getUTCFullYear();
  const m = String(algiers.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${y}-${m}-01T00:00:00${ALGIERS}`);
}

export async function getPlatformOverview(_admin: AdminContext, db: Db = getDb()) {
  const monthStart = currentMonthStart();
  const [
    organizations,
    usersByStatus,
    subsByPlan,
    withoutSubscription,
    invoicesIssued,
    invoicesIssuedMonth,
    quotes,
    aiByStatus,
    aiErrorCodes,
    aiByModel,
    aiCostByCurrency,
    aiUncosted,
    topOrgs,
    recentAudit,
  ] = await Promise.all([
    db.organization.count(),
    db.user.groupBy({ by: ["status"], _count: { _all: true } }),
    db.subscription.groupBy({ by: ["planId", "status"], _count: { _all: true } }),
    db.organization.count({ where: { subscription: null } }),
    db.invoice.count({ where: { status: { not: "DRAFT" } } }),
    db.invoice.count({ where: { status: { not: "DRAFT" }, issuedAt: { gte: monthStart } } }),
    db.quote.count(),
    db.aIUsage.groupBy({
      by: ["status"],
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
    db.aIUsage.groupBy({
      by: ["errorCode"],
      where: { createdAt: { gte: monthStart }, errorCode: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { errorCode: "desc" } },
      take: 5,
    }),
    db.aIUsage.groupBy({
      by: ["provider", "model"],
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: { totalTokens: true },
    }),
    db.aIUsage.groupBy({
      by: ["currency"],
      where: { createdAt: { gte: monthStart }, estimatedCost: { not: null } },
      _sum: { estimatedCost: true },
    }),
    db.aIUsage.count({
      where: { createdAt: { gte: monthStart }, estimatedCost: null, status: "SUCCESS" },
    }),
    db.aIUsage.groupBy({
      by: ["organizationId"],
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
      _sum: { totalTokens: true },
      orderBy: { _count: { organizationId: "desc" } },
      take: 5,
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        action: true,
        createdAt: true,
        organization: { select: { name: true } },
        user: { select: { email: true } },
      },
    }),
  ]);

  const plans = await db.subscriptionPlan.findMany({
    select: { id: true, code: true, name: true },
  });
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const orgs = await db.organization.findMany({
    where: { id: { in: topOrgs.map((t) => t.organizationId) } },
    select: { id: true, name: true },
  });
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  return {
    monthStart,
    organizations,
    users: Object.fromEntries(usersByStatus.map((u) => [u.status, u._count._all])) as Record<
      string,
      number
    >,
    subscriptions: subsByPlan.map((s) => ({
      plan: planName.get(s.planId) ?? s.planId,
      status: s.status,
      count: s._count._all,
    })),
    withoutSubscription,
    invoicesIssued,
    invoicesIssuedMonth,
    quotes,
    ai: {
      byStatus: aiByStatus.map((s) => ({
        status: s.status,
        calls: s._count._all,
        tokens: s._sum.totalTokens ?? 0,
      })),
      errorCodes: aiErrorCodes.map((e) => ({ code: e.errorCode ?? "?", count: e._count._all })),
      byModel: aiByModel.map((m) => ({
        provider: m.provider,
        model: m.model,
        calls: m._count._all,
        tokens: m._sum.totalTokens ?? 0,
      })),
      cost: aiCostByCurrency.map((c) => ({
        currency: c.currency,
        amount: (c._sum.estimatedCost ?? 0).toString(),
      })),
      uncostedCalls: aiUncosted,
      topOrganizations: topOrgs.map((t) => ({
        name: orgName.get(t.organizationId) ?? "—",
        calls: t._count._all,
        tokens: t._sum.totalTokens ?? 0,
      })),
    },
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      action: a.action,
      at: a.createdAt,
      organization: a.organization?.name ?? null,
      user: a.user?.email ?? null,
    })),
  };
}

const PAGE_SIZE = 20;

/** Valeurs du filtre « abonnement » de la liste des entreprises (en plus de NONE). */
export const SUBSCRIPTION_FILTERS = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED"] as const;

export async function listOrganizations(
  _admin: AdminContext,
  input: { page?: number; q?: string; subscription?: string },
  db: Db = getDb(),
) {
  const page = Math.max(1, input.page ?? 1);
  const q = input.q?.trim().slice(0, 100);
  // Filtre d'abonnement : « NONE » (sans abonnement) ou un statut connu ; toute autre valeur est ignorée.
  const sub = input.subscription;
  const subscriptionWhere =
    sub === "NONE"
      ? { subscription: { is: null } }
      : sub && (SUBSCRIPTION_FILTERS as readonly string[]).includes(sub)
        ? { subscription: { is: { status: sub as (typeof SUBSCRIPTION_FILTERS)[number] } } }
        : {};
  const where = {
    ...(q
      ? {
          OR: [{ name: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q } }],
        }
      : {}),
    ...subscriptionWhere,
  };
  const monthStart = currentMonthStart();
  const [total, rows] = await Promise.all([
    db.organization.count({ where }),
    db.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        createdAt: true,
        subscription: { select: { status: true, plan: { select: { code: true, name: true } } } },
        _count: { select: { members: true, invoices: true } },
      },
    }),
  ]);
  const ids = rows.map((r) => r.id);
  const ai = await db.aIUsage.groupBy({
    by: ["organizationId"],
    where: { organizationId: { in: ids }, createdAt: { gte: monthStart } },
    _count: { _all: true },
  });
  const aiCalls = new Map(ai.map((a) => [a.organizationId, a._count._all]));
  return {
    page,
    pageSize: PAGE_SIZE,
    total,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      planCode: r.subscription?.plan.code ?? null,
      planName: r.subscription?.plan.name ?? null,
      status: r.subscription?.status ?? null,
      members: r._count.members,
      invoices: r._count.invoices,
      aiCallsThisMonth: aiCalls.get(r.id) ?? 0,
    })),
  };
}

export async function listUsers(
  _admin: AdminContext,
  input: { page?: number; q?: string; status?: string },
  db: Db = getDb(),
) {
  const page = Math.max(1, input.page ?? 1);
  const q = input.q?.trim().slice(0, 100);
  const where = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(input.status === "ACTIVE" || input.status === "SUSPENDED"
      ? { status: input.status as "ACTIVE" | "SUSPENDED" }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        platformRole: true,
        createdAt: true,
        _count: { select: { memberships: true } },
      },
    }),
  ]);
  return {
    page,
    pageSize: PAGE_SIZE,
    total,
    rows: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status,
      isAdmin: u.platformRole === "SUPER_ADMIN",
      createdAt: u.createdAt,
      organizations: u._count.memberships,
    })),
  };
}

export async function listPlans(_admin: AdminContext, db: Db = getDb()) {
  const plans = await db.subscriptionPlan.findMany({
    orderBy: { priceMonthly: "asc" },
    include: { limits: true, _count: { select: { subscriptions: true } } },
  });
  return plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    priceMonthly: p.priceMonthly.toString(),
    active: p.active,
    subscribers: p._count.subscriptions,
    limits: Object.fromEntries(p.limits.map((l) => [l.key, l.value?.toString() ?? null])) as Record<
      string,
      string | null
    >,
  }));
}

export async function listPricing(_admin: AdminContext, db: Db = getDb()) {
  const rows = await db.modelPricing.findMany({
    orderBy: [{ provider: "asc" }, { model: "asc" }, { effectiveFrom: "desc" }],
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    input: r.inputCostPerMillionTokens.toString(),
    output: r.outputCostPerMillionTokens.toString(),
    cachedInput: r.cachedInputCostPerMillionTokens?.toString() ?? null,
    currency: r.currency,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  }));
}
