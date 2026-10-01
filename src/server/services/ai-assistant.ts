import "server-only";
import { ANALYTICS_SYSTEM_PROMPT, frameQuestion } from "@/server/ai/prompts/analytics";
import { runAI } from "@/server/ai/run";
import { analyticsTools } from "@/server/ai/tools/analytics";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";

/**
 * Assistant analytique : le modèle répond UNIQUEMENT à partir d'outils serveur en lecture
 * seule. La réponse est renvoyée avec les « données utilisées » (résultats bruts des outils)
 * pour que l'utilisateur puisse vérifier les chiffres : le texte du modèle n'est jamais la
 * source de vérité.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;
export const MAX_QUESTION_LENGTH = 500;

export async function askAssistant(ctx: Ctx, question: string) {
  assertPermission(ctx, "ai:use");
  assertPermission(ctx, "stats:read");
  const text = question.trim();
  if (text.length < 3) throw new AppError("VALIDATION_ERROR", "Posez votre question.");
  if (text.length > MAX_QUESTION_LENGTH)
    throw new AppError(
      "VALIDATION_ERROR",
      `Question trop longue (${MAX_QUESTION_LENGTH} caractères maximum).`,
    );

  const tools = analyticsTools(ctx);
  const { data } = await runAI(
    ctx,
    "ANALYTICS",
    (provider) =>
      provider.generateWithTools(
        { system: ANALYTICS_SYSTEM_PROMPT, user: frameQuestion(text), maxOutputTokens: 800 },
        tools,
      ),
    (r) => r,
  );
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "ai.question",
    entity: "AI",
    metadata: { tools: data.calls.map((c) => c.tool) },
  });
  return { answer: data.text, sources: data.calls };
}
