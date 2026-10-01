import "server-only";
import { todayISO } from "@/lib/dates";
import { Money } from "@/lib/money";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";

/**
 * Plans et limites. Les valeurs vivent en base (`usage_limits`, une ligne par limite,
 * `value = null` ou ligne absente = illimité) : rien n'est codé en dur ici.
 *
 * Périodes : mois CALENDAIRE en heure d'Alger (Africa/Algiers, sans heure d'été), indépendant des
 * dates de période de l'abonnement (aucun paiement en ligne ne les fait avancer aujourd'hui).
 *
 * Ce qui est compté :
 *  - INVOICES_PER_MONTH : factures ÉMISES (numéro attribué) dans le mois, annulées comprises
 *    (le numéro est consommé) ; les brouillons ne comptent pas.
 *  - QUOTES_PER_MONTH : devis créés dans le mois.
 *  - MEMBERS : membres de l'entreprise.
 *  - AI_REQUESTS_PER_MONTH : appels ayant atteint le fournisseur (succès, sortie invalide,
 *    erreur) ; les refus pour limite ne comptent pas.
 *  - AI_TOKENS_PER_MONTH : jetons (entrée + sortie) de ces appels.
 *  - AI_BUDGET_USD_PER_MONTH : coût estimé en USD (appels sans tarif connu non valorisables).
 *  - STORAGE_MB : pas encore mesuré (aucun stockage de fichiers) : non appliqué.
 *
 * Exactitude : les limites de factures et de devis sont vérifiées DANS la transaction, après un
 * verrou de ligne sur l'entreprise : deux émissions simultanées ne peuvent pas dépasser la limite.
 * Les limites IA sont « souples » : la vérification précède l'appel, donc des appels simultanés
 * peuvent dépasser de quelques unités (le débit par utilisateur limite déjà ce risque).
 *
 * Abonnement CANCELLED : les actions limitées (émettre, créer un devis, IA) sont refusées ; la
 * consultation, les PDF et les paiements restent possibles. TRIALING et PAST_DUE restent actifs
 * (aucune politique de relance n'existe encore). Entreprise SANS abonnement (anomalie) : aucune
 * limite appliquée et une alerte est journalisée.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;
export type LimitKeyId =
  | "INVOICES_PER_MONTH"
  | "QUOTES_PER_MONTH"
  | "MEMBERS"
  | "STORAGE_MB"
  | "AI_REQUESTS_PER_MONTH"
  | "AI_TOKENS_PER_MONTH"
  | "AI_BUDGET_USD_PER_MONTH";

/** Client tenant, ou transaction de ce client. */
export type LimitDb = Pick<
  Ctx["db"],
  "invoice" | "quote" | "aIUsage" | "organizationMember" | "subscription" | "organization"
>;

export const LIMIT_LABELS: Record<LimitKeyId, { label: string; unit: string }> = {
  INVOICES_PER_MONTH: { label: "Factures émises par mois", unit: "" },
  QUOTES_PER_MONTH: { label: "Devis créés par mois", unit: "" },
  MEMBERS: { label: "Utilisateurs", unit: "" },
  STORAGE_MB: { label: "Stockage", unit: "Mo" },
  AI_REQUESTS_PER_MONTH: { label: "Requêtes IA par mois", unit: "" },
  AI_TOKENS_PER_MONTH: { label: "Jetons IA par mois", unit: "" },
  AI_BUDGET_USD_PER_MONTH: { label: "Budget IA par mois", unit: "USD" },
};

/** Bornes [début, fin[ du mois courant à Alger. */
export function monthBounds(todayIso: string = todayISO()) {
  const [y, m] = todayIso.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    from: new Date(`${y}-${pad(m)}-01T00:00:00+01:00`),
    to: new Date(`${ny}-${pad(nm)}-01T00:00:00+01:00`),
  };
}

export async function getSubscriptionInfo(db: LimitDb) {
  const sub = await db.subscription.findFirst({
    select: {
      status: true,
      plan: {
        select: { code: true, name: true, limits: { select: { key: true, value: true } } },
      },
    },
  });
  if (!sub) return null;
  const limits = {} as Partial<Record<LimitKeyId, number | null>>;
  for (const l of sub.plan.limits) limits[l.key] = l.value === null ? null : Number(l.value);
  return { status: sub.status, planCode: sub.plan.code, planName: sub.plan.name, limits };
}

/** Consommation courante pour une limite (null = non mesurée). */
export async function currentUsage(db: LimitDb, key: LimitKeyId): Promise<Money | null> {
  const { from, to } = monthBounds();
  const month = { gte: from, lt: to };
  const reached = {
    in: ["SUCCESS", "INVALID_OUTPUT", "ERROR"] as ("SUCCESS" | "INVALID_OUTPUT" | "ERROR")[],
  };
  switch (key) {
    case "INVOICES_PER_MONTH":
      return new Money(await db.invoice.count({ where: { issuedAt: month } }));
    case "QUOTES_PER_MONTH":
      return new Money(await db.quote.count({ where: { createdAt: month } }));
    case "MEMBERS":
      return new Money(await db.organizationMember.count());
    case "AI_REQUESTS_PER_MONTH":
      return new Money(await db.aIUsage.count({ where: { createdAt: month, status: reached } }));
    case "AI_TOKENS_PER_MONTH": {
      const r = await db.aIUsage.aggregate({
        where: { createdAt: month, status: reached },
        _sum: { totalTokens: true },
      });
      return new Money(r._sum.totalTokens ?? 0);
    }
    case "AI_BUDGET_USD_PER_MONTH": {
      const r = await db.aIUsage.aggregate({
        where: { createdAt: month, currency: "USD", estimatedCost: { not: null } },
        _sum: { estimatedCost: true },
      });
      return new Money(r._sum.estimatedCost?.toString() ?? 0);
    }
    case "STORAGE_MB":
      return null;
  }
}

const COUNTED: LimitKeyId[] = [
  "INVOICES_PER_MONTH",
  "QUOTES_PER_MONTH",
  "MEMBERS",
  "AI_REQUESTS_PER_MONTH",
];

/**
 * Refuse (LIMIT_EXCEEDED) si l'action dépasse une limite du plan ou si l'abonnement est résilié.
 * `adding` : nombre d'unités que l'action va créer (pour les limites « en nombre »). Pour les
 * limites en jetons / budget, l'action est refusée une fois la limite atteinte.
 */
export async function assertWithinLimit(
  db: LimitDb,
  key: LimitKeyId,
  options: { adding?: number } = {},
) {
  const info = await getSubscriptionInfo(db);
  if (!info) {
    logger.warn({ key }, "Entreprise sans abonnement : limite non appliquée");
    return;
  }
  if (info.status === "CANCELLED") {
    throw new AppError(
      "LIMIT_EXCEEDED",
      "Votre abonnement est résilié : cette action n'est plus disponible.",
    );
  }
  const limit = info.limits[key];
  if (limit === undefined || limit === null) return; // illimité
  const used = await currentUsage(db, key);
  if (!used) return;
  const adding = COUNTED.includes(key) ? (options.adding ?? 1) : 0;
  const exceeded = adding > 0 ? used.plus(adding).gt(limit) : used.gte(limit);
  if (exceeded) {
    const { label, unit } = LIMIT_LABELS[key];
    throw new AppError(
      "LIMIT_EXCEEDED",
      `Limite du plan « ${info.planName} » atteinte : ${label.toLowerCase()} (${limit}${unit ? ` ${unit}` : ""}). Passez à un plan supérieur pour continuer.`,
    );
  }
}

/**
 * Verrou de ligne sur l'entreprise, à prendre au début d'une transaction qui vérifie une limite :
 * les transactions concurrentes de la même entreprise s'exécutent l'une après l'autre.
 */
export async function lockOrganization(tx: LimitDb, organizationId: string) {
  await tx.organization.update({ where: { id: organizationId }, data: { updatedAt: new Date() } });
}

/** Les trois limites IA, dans l'ordre : requêtes, jetons, budget. */
export async function assertAiQuota(db: LimitDb) {
  await assertWithinLimit(db, "AI_REQUESTS_PER_MONTH");
  await assertWithinLimit(db, "AI_TOKENS_PER_MONTH");
  await assertWithinLimit(db, "AI_BUDGET_USD_PER_MONTH");
}

/** Vue d'ensemble pour la page Abonnement : plan, statut, et pour chaque limite usage / plafond. */
export async function getUsageOverview(ctx: Ctx) {
  assertPermission(ctx, "settings:manage");
  const info = await getSubscriptionInfo(ctx.db);
  const keys = Object.keys(LIMIT_LABELS) as LimitKeyId[];
  const rows = await Promise.all(
    keys.map(async (key) => {
      const used = await currentUsage(ctx.db, key);
      const limit = info?.limits[key];
      return {
        key,
        ...LIMIT_LABELS[key],
        used: used ? used.toDecimalPlaces(6).toString() : null,
        limit: limit === undefined || limit === null ? null : limit,
      };
    }),
  );
  return {
    plan: info ? { code: info.planCode, name: info.planName, status: info.status } : null,
    rows,
  };
}
