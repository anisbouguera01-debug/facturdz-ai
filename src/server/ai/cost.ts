import "server-only";
import { Money } from "@/lib/money";
import { getDb } from "@/server/db/client";
import type { AIUsageReport } from "./types";

/**
 * Coût estimé d'un appel IA. Règles :
 * - Decimal uniquement (jamais de flottants), arrondi à 6 décimales (colonne DECIMAL(14,6)).
 * - AUCUN tarif n'est codé en dur ni inventé : les tarifs viennent de la table `model_pricing`,
 *   saisis par l'exploitant avec leur date d'effet. Sans tarif applicable → coût `null`
 *   (« non estimé »), jamais 0.
 * - `inputTokens` INCLUT les jetons en cache (convention OpenAI et Gemini) : la part en cache
 *   est facturée au tarif « entrée en cache » s'il existe, sinon au tarif d'entrée normal.
 * - Estimation indicative : seule la facture du fournisseur fait foi.
 */
export interface PricingRow {
  id: string;
  inputCostPerMillionTokens: { toString(): string };
  outputCostPerMillionTokens: { toString(): string };
  cachedInputCostPerMillionTokens: { toString(): string } | null;
  currency: string;
}

const MILLION = new Money(1_000_000);

export function computeCost(usage: AIUsageReport, pricing: PricingRow): string {
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  const input = new Money(pricing.inputCostPerMillionTokens.toString());
  const cachedPrice = pricing.cachedInputCostPerMillionTokens
    ? new Money(pricing.cachedInputCostPerMillionTokens.toString())
    : input;
  const output = new Money(pricing.outputCostPerMillionTokens.toString());
  return new Money(fresh)
    .times(input)
    .plus(new Money(cached).times(cachedPrice))
    .plus(new Money(usage.outputTokens).times(output))
    .dividedBy(MILLION)
    .toDecimalPlaces(6)
    .toFixed(6);
}

/** Tarif en vigueur à la date `at` pour un fournisseur et un modèle, ou null. */
export async function findPricing(
  provider: "OPENAI" | "GEMINI" | "MOCK",
  model: string,
  at: Date = new Date(),
) {
  return getDb().modelPricing.findFirst({
    where: {
      provider,
      model,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}
