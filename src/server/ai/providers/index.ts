import "server-only";
import { serverEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import type { AIProvider } from "../types";
import { GeminiProvider } from "./gemini";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";

/**
 * Sélection du fournisseur selon `AI_PROVIDER`. Les clés ne sont lues qu'ici, jamais
 * journalisées.
 */
export function getProvider(): AIProvider {
  const env = serverEnv();
  switch (env.AI_PROVIDER) {
    case "mock":
      return new MockProvider();
    case "openai": {
      // Aucun modèle par défaut inventé : l'exploitant choisit explicitement (AI_MODEL).
      if (!env.OPENAI_API_KEY || !env.AI_MODEL) {
        logger.error("OPENAI_API_KEY ou AI_MODEL manquant alors que AI_PROVIDER=openai");
        throw new AppError("AI_UNAVAILABLE", "L'assistant IA n'est pas configuré.");
      }
      return new OpenAIProvider({ apiKey: env.OPENAI_API_KEY, model: env.AI_MODEL });
    }
    case "gemini": {
      if (!env.GEMINI_API_KEY || !env.AI_MODEL) {
        logger.error("GEMINI_API_KEY ou AI_MODEL manquant alors que AI_PROVIDER=gemini");
        throw new AppError("AI_UNAVAILABLE", "L'assistant IA n'est pas configuré.");
      }
      return new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.AI_MODEL });
    }
    default:
      throw new AppError(
        "AI_UNAVAILABLE",
        "L'assistant IA n'est pas encore configuré pour cet environnement.",
      );
  }
}
