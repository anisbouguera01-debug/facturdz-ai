import "server-only";
import { randomUUID } from "node:crypto";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { computeCost, findPricing } from "./cost";
import { getProvider } from "./providers";
import type { AIFeatureId, AIProvider, AIResult } from "./types";

type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

/** Sortie du modèle non conforme au schéma attendu. */
export class InvalidAIOutputError extends Error {
  constructor(message = "Réponse de l'IA non conforme.") {
    super(message);
    this.name = "InvalidAIOutputError";
  }
}

/** Limite provisoire par utilisateur ; les quotas par plan arrivent en Phase 16. */
export const AI_REQUESTS_PER_MINUTE = 20;

/**
 * Point d'entrée UNIQUE des appels IA :
 *   permission `ai:use` → limite de débit → appel fournisseur → validation → AIUsage.
 * Un `AIUsage` est enregistré dans TOUS les cas (succès, erreur fournisseur, sortie invalide,
 * limite atteinte). Le coût estimé vient de `model_pricing` (null = « non estimé » : aucun tarif applicable).
 * Le prompt et la réponse ne sont jamais journalisés ; seuls des compteurs le sont.
 */
export async function runAI<R, T>(
  ctx: Ctx,
  feature: AIFeatureId,
  call: (provider: AIProvider) => Promise<AIResult<R>>,
  parse: (data: R) => T,
): Promise<{ data: T; usage: AIResult<R>["usage"]; model: string }> {
  assertPermission(ctx, "ai:use");
  const provider = getProvider();
  const requestId = randomUUID();
  const base = {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    provider: provider.id,
    model: provider.model,
    feature,
    requestId,
  };

  try {
    await consumeRateLimit("ai:user", ctx.userId, AI_REQUESTS_PER_MINUTE, 60);
  } catch (error) {
    await ctx.db.aIUsage.create({
      data: { ...base, latencyMs: 0, status: "REJECTED_LIMIT", errorCode: "RATE_LIMITED" },
    });
    throw error;
  }

  const started = Date.now();
  let result: AIResult<R>;
  try {
    result = await call(provider);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "PROVIDER_ERROR";
    logger.warn({ requestId, feature, provider: provider.id, code }, "Échec d'un appel IA");
    await ctx.db.aIUsage.create({
      data: { ...base, latencyMs: Date.now() - started, status: "ERROR", errorCode: code },
    });
    throw error instanceof AppError
      ? error
      : new AppError("AI_UNAVAILABLE", undefined, { cause: error });
  }

  /** Tarif applicable → coût estimé ; sans tarif (ou en cas d'échec de lecture) → null. */
  const costOf = async () => {
    try {
      const pricing = await findPricing(result.provider, result.model);
      if (!pricing) return {};
      return {
        estimatedCost: computeCost(result.usage, pricing),
        currency: pricing.currency,
        pricingId: pricing.id,
      };
    } catch (error) {
      logger.warn({ err: error, requestId }, "Tarif IA illisible : coût non estimé");
      return {};
    }
  };

  const record = async (status: "SUCCESS" | "INVALID_OUTPUT", errorCode?: string) =>
    ctx.db.aIUsage.create({
      data: {
        ...base,
        provider: result.provider,
        model: result.model,
        providerRequestId: result.providerRequestId,
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.inputTokens + result.usage.outputTokens,
        ...(await costOf()),
        latencyMs: Date.now() - started,
        status,
        errorCode,
      },
    });

  try {
    const data = parse(result.data);
    await record("SUCCESS");
    return { data, usage: result.usage, model: result.model };
  } catch (error) {
    if (error instanceof InvalidAIOutputError || (error as { name?: string }).name === "ZodError") {
      await record("INVALID_OUTPUT", "INVALID_OUTPUT");
      throw new InvalidAIOutputError();
    }
    await record("SUCCESS");
    throw error;
  }
}
