import "server-only";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { AppError } from "@/server/errors";

/**
 * Enregistrement d'un tarif de modèle (table globale `model_pricing`). Les tarifs sont saisis
 * par l'exploitant de la plateforme (aucune valeur par défaut). Un nouveau tarif ferme le tarif
 * ouvert du même modèle à sa date d'effet : l'historique est conservé, les appels déjà
 * enregistrés gardent le tarif (`pricingId`) avec lequel ils ont été estimés.
 * Appelé par `pnpm ai:pricing` ; le panneau d'administration (Phase 17) réutilisera cette fonction.
 */
const price = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Prix invalide (6 décimales au maximum).")
  .refine((v) => Number(v) < 1_000_000, "Prix trop élevé.");

export const pricingSchema = z.object({
  provider: z.enum(["OPENAI", "GEMINI"]),
  model: z.string().trim().min(1).max(100),
  input: price,
  output: price,
  cachedInput: price.optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  effectiveFrom: z.coerce.date(),
});
export type PricingInput = z.input<typeof pricingSchema>;

export async function setModelPricing(db: Db, input: PricingInput) {
  const p = pricingSchema.parse(input);
  return db.$transaction(async (tx) => {
    const open = await tx.modelPricing.findMany({
      where: { provider: p.provider, model: p.model, effectiveTo: null },
    });
    if (open.some((o) => o.effectiveFrom >= p.effectiveFrom))
      throw new AppError(
        "CONFLICT",
        "Un tarif existe déjà à cette date ou après : choisissez une date d'effet plus récente.",
      );
    await tx.modelPricing.updateMany({
      where: { provider: p.provider, model: p.model, effectiveTo: null },
      data: { effectiveTo: p.effectiveFrom },
    });
    return tx.modelPricing.create({
      data: {
        provider: p.provider,
        model: p.model,
        inputCostPerMillionTokens: p.input,
        outputCostPerMillionTokens: p.output,
        cachedInputCostPerMillionTokens: p.cachedInput,
        currency: p.currency,
        effectiveFrom: p.effectiveFrom,
      },
    });
  });
}
