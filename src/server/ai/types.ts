import type { ZodType } from "zod";

/**
 * Abstraction des fournisseurs d'IA. Seuls les fichiers de `providers/` connaissent un SDK.
 * Règle de conception : le modèle INTERPRÈTE ; le serveur valide, calcule et décide.
 */
export type AIProviderId = "OPENAI" | "GEMINI" | "MOCK";
export type AIFeatureId =
  | "INVOICE_GENERATION"
  | "QUOTE_GENERATION"
  | "ANALYTICS"
  | "CUSTOMER_MESSAGE"
  | "GENERAL_ASSISTANT";

export interface AIUsageReport {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface AIResult<T> {
  data: T;
  provider: AIProviderId;
  model: string;
  providerRequestId?: string;
  usage: AIUsageReport;
}

export interface AIRequest {
  /** Instructions du système : jamais mélangées aux données de l'utilisateur. */
  system: string;
  /** Message de l'utilisateur, déjà encadré comme DONNÉE par l'appelant. */
  user: string;
  /** Message de correction (relance après sortie invalide). */
  correction?: string;
  maxOutputTokens?: number;
}

/** Outil en LECTURE SEULE exposé au modèle. Les paramètres ne contiennent jamais d'identifiant d'entreprise. */
export interface AITool<A = unknown> {
  name: string;
  description: string;
  parameters: ZodType<A>;
  execute: (args: A) => Promise<unknown>;
}

export interface AIToolCall {
  tool: string;
  args: unknown;
  result: unknown;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly model: string;
  generateText(req: AIRequest): Promise<AIResult<string>>;
  generateStructuredOutput<T>(
    req: AIRequest,
    schema: ZodType<T>,
    meta?: { name: string },
  ): Promise<AIResult<unknown>>;
  /** Boucle d'outils : le fournisseur appelle `tools` (lecture seule) puis rédige la réponse. */
  generateWithTools(
    req: AIRequest,
    tools: AITool[],
  ): Promise<AIResult<{ text: string; calls: AIToolCall[] }>>;
}
