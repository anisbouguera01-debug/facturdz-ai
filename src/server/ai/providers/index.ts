import "server-only";
import { serverEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import type { AIProvider } from "../types";
import { MockProvider } from "./mock";

/**
 * Sélection du fournisseur selon `AI_PROVIDER`. Les clés ne sont lues qu'ici, jamais
 * journalisées. OpenAI (Phase 13) et Gemini (Phase 14) s'ajouteront à ce commutateur.
 */
export function getProvider(): AIProvider {
  const env = serverEnv();
  switch (env.AI_PROVIDER) {
    case "mock":
      return new MockProvider();
    case "openai":
    case "gemini":
    default:
      throw new AppError(
        "AI_UNAVAILABLE",
        "L'assistant IA n'est pas encore configuré pour cet environnement.",
      );
  }
}
