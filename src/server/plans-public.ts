import "server-only";
import { getDb } from "@/server/db/client";

/**
 * Plans affichés sur la page publique : lus en base (les mêmes plans et limites que ceux appliqués
 * par l'application), jamais écrits en dur. Si la base est injoignable, la page reste servie
 * sans la grille tarifaire.
 */
export interface PublicPlan {
  code: string;
  name: string;
  priceMonthly: string;
  currency: string;
  limits: Record<string, string | null>;
}

export async function listPublicPlans(): Promise<PublicPlan[]> {
  try {
    const plans = await getDb().subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { priceMonthly: "asc" },
      include: { limits: true },
    });
    return plans.map((p) => ({
      code: p.code,
      name: p.name,
      priceMonthly: p.priceMonthly.toString(),
      currency: p.currency,
      limits: Object.fromEntries(p.limits.map((l) => [l.key, l.value?.toString() ?? null])),
    }));
  } catch {
    return [];
  }
}
