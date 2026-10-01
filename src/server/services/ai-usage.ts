import "server-only";
import { addDays } from "@/lib/dates";
import { Money } from "@/lib/money";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { periodRange, type Period } from "./stats";

/**
 * Consommation IA d'une entreprise (jetons, appels, coût estimé), calculée en base.
 * - Réservé au droit `stats:read` ; strictement limité à l'entreprise (client tenant).
 * - Le coût est une ESTIMATION indicative issue de `model_pricing` ; les appels sans tarif
 *   applicable sont comptés à part (`uncostedCalls`) et jamais valorisés à 0.
 * - Aucun prompt ni réponse n'est stocké : seuls des compteurs sont lus.
 * - Les montants sont regroupés par devise (un total mélangeant des devises n'aurait pas de sens).
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

const ALGIERS = "+01:00"; // pas d'heure d'été en Algérie

export async function getAIUsageSummary(ctx: Ctx, period: Period) {
  assertPermission(ctx, "stats:read");
  const { from, to } = periodRange(period);
  const where = {
    createdAt: {
      gte: new Date(`${from}T00:00:00${ALGIERS}`),
      lt: new Date(`${addDays(to, 1)}T00:00:00${ALGIERS}`),
    },
  };

  const [byStatus, byFeature, byCurrency, uncosted] = await Promise.all([
    ctx.db.aIUsage.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { inputTokens: true, cachedInputTokens: true, outputTokens: true },
    }),
    ctx.db.aIUsage.groupBy({
      by: ["feature", "currency"],
      where,
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCost: true },
    }),
    ctx.db.aIUsage.groupBy({
      by: ["currency"],
      where: { ...where, estimatedCost: { not: null } },
      _sum: { estimatedCost: true },
    }),
    // Appels ayant consommé des jetons mais sans tarif applicable.
    ctx.db.aIUsage.count({ where: { ...where, estimatedCost: null, totalTokens: { gt: 0 } } }),
  ]);

  const tokens = byStatus.reduce(
    (a, r) => ({
      input: a.input + (r._sum.inputTokens ?? 0),
      cachedInput: a.cachedInput + (r._sum.cachedInputTokens ?? 0),
      output: a.output + (r._sum.outputTokens ?? 0),
    }),
    { input: 0, cachedInput: 0, output: 0 },
  );
  const calls = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Partial<
    Record<(typeof byStatus)[number]["status"], number>
  >;

  // Fonction « par fonctionnalité » : on regroupe les devises d'une même fonctionnalité.
  const features = new Map<
    string,
    { feature: string; calls: number; tokens: number; costs: Map<string, Money> }
  >();
  for (const r of byFeature) {
    const f = features.get(r.feature) ?? {
      feature: r.feature,
      calls: 0,
      tokens: 0,
      costs: new Map<string, Money>(),
    };
    f.calls += r._count._all;
    f.tokens += r._sum.totalTokens ?? 0;
    if (r._sum.estimatedCost) {
      f.costs.set(
        r.currency,
        (f.costs.get(r.currency) ?? new Money(0)).plus(r._sum.estimatedCost.toString()),
      );
    }
    features.set(r.feature, f);
  }

  const fmt = (m: Money) => m.toDecimalPlaces(6).toFixed(6);
  return {
    period,
    from,
    to,
    calls: {
      total: byStatus.reduce((n, r) => n + r._count._all, 0),
      success: calls.SUCCESS ?? 0,
      error: calls.ERROR ?? 0,
      invalidOutput: calls.INVALID_OUTPUT ?? 0,
      rejectedLimit: calls.REJECTED_LIMIT ?? 0,
    },
    tokens: { ...tokens, total: tokens.input + tokens.output },
    cost: byCurrency
      .filter((r) => r._sum.estimatedCost)
      .map((r) => ({
        currency: r.currency,
        amount: fmt(new Money(r._sum.estimatedCost!.toString())),
      })),
    uncostedCalls: uncosted,
    byFeature: [...features.values()]
      .sort((a, b) => b.calls - a.calls)
      .map((f) => ({
        feature: f.feature,
        calls: f.calls,
        tokens: f.tokens,
        cost: [...f.costs.entries()].map(([currency, m]) => ({ currency, amount: fmt(m) })),
      })),
  };
}
