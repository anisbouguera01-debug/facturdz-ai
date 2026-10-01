import "server-only";
import { z, type ZodType } from "zod";
import { AppError } from "@/server/errors";
import type { AIProvider, AIRequest, AIResult, AITool, AIToolCall, AIUsageReport } from "../types";
import { postJson } from "./http";

/**
 * Fournisseur OpenAI (API Chat Completions) via `fetch` : aucune dépendance ajoutée, aucun SDK,
 * donc rien d'autre que ce fichier ne connaît OpenAI. La clé n'est lue que par `getProvider()`
 * (serveur), envoyée dans l'en-tête Authorization, et n'est jamais journalisée.
 *
 * Garanties :
 * - délai maximal par appel (timeout) et UNE relance sur erreur réseau / 429 / 5xx ;
 * - le corps d'une réponse d'erreur n'est jamais journalisé ni renvoyé à l'utilisateur
 *   (il peut contenir des extraits de la requête) : seul le code HTTP l'est ;
 * - sortie « structurée » = mode JSON ; la VALIDATION reste faite par Zod côté serveur ;
 * - boucle d'outils bornée (MAX_TOOL_ROUNDS) ; un outil inconnu n'est jamais exécuté et des
 *   arguments invalides sont refusés par le schéma Zod de l'outil.
 */
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const OPENAI_TIMEOUT_MS = 30_000;
export const MAX_TOOL_ROUNDS = 4;

export interface OpenAIOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injectables pour les tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ChatResponse {
  id?: string;
  choices?: { message?: ChatMessage }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export class OpenAIProvider implements AIProvider {
  readonly id = "OPENAI" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: OpenAIOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? OPENAI_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? OPENAI_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private chat(body: Record<string, unknown>): Promise<ChatResponse> {
    return postJson<ChatResponse>(
      "openai",
      `${this.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      { model: this.model, ...body },
      { fetchImpl: this.fetchImpl, sleep: this.sleep, timeoutMs: this.timeoutMs },
    );
  }

  private static usage(r: ChatResponse): AIUsageReport {
    return {
      inputTokens: r.usage?.prompt_tokens ?? 0,
      cachedInputTokens: r.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      outputTokens: r.usage?.completion_tokens ?? 0,
    };
  }

  private static sum(a: AIUsageReport, b: AIUsageReport): AIUsageReport {
    return {
      inputTokens: a.inputTokens + b.inputTokens,
      cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
    };
  }

  private static messages(req: AIRequest): ChatMessage[] {
    const m: ChatMessage[] = [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ];
    if (req.correction) m.push({ role: "user", content: req.correction });
    return m;
  }

  async generateText(req: AIRequest): Promise<AIResult<string>> {
    const r = await this.chat({
      messages: OpenAIProvider.messages(req),
      ...(req.maxOutputTokens ? { max_completion_tokens: req.maxOutputTokens } : {}),
    });
    return {
      data: r.choices?.[0]?.message?.content ?? "",
      provider: this.id,
      model: this.model,
      providerRequestId: r.id,
      usage: OpenAIProvider.usage(r),
    };
  }

  /**
   * Mode JSON : renvoie la valeur analysée SANS la valider (le serveur la valide avec Zod).
   * Un contenu qui n'est pas du JSON est renvoyé tel quel (chaîne) : la validation échouera
   * et déclenchera la relance de correction.
   */
  async generateStructuredOutput<T>(
    req: AIRequest,
    schema: ZodType<T>,
    meta?: { name: string },
  ): Promise<AIResult<unknown>> {
    void schema;
    void meta;
    const r = await this.chat({
      messages: OpenAIProvider.messages(req),
      response_format: { type: "json_object" },
      ...(req.maxOutputTokens ? { max_completion_tokens: req.maxOutputTokens } : {}),
    });
    const content = r.choices?.[0]?.message?.content ?? "";
    let data: unknown = content;
    try {
      data = JSON.parse(content);
    } catch {
      /* laissé tel quel : sera rejeté par la validation */
    }
    return {
      data,
      provider: this.id,
      model: this.model,
      providerRequestId: r.id,
      usage: OpenAIProvider.usage(r),
    };
  }

  async generateWithTools(
    req: AIRequest,
    tools: AITool[],
  ): Promise<AIResult<{ text: string; calls: AIToolCall[] }>> {
    const byName = new Map(tools.map((t) => [t.name, t]));
    const definitions = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: z.toJSONSchema(t.parameters),
      },
    }));
    const messages = OpenAIProvider.messages(req);
    const calls: AIToolCall[] = [];
    let usage: AIUsageReport = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    let lastId: string | undefined;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // Au dernier tour, plus d'outils : le modèle doit conclure avec ce qu'il a.
      const last = round === MAX_TOOL_ROUNDS;
      const r = await this.chat({
        messages,
        ...(last ? {} : { tools: definitions }),
        ...(req.maxOutputTokens ? { max_completion_tokens: req.maxOutputTokens } : {}),
      });
      usage = OpenAIProvider.sum(usage, OpenAIProvider.usage(r));
      lastId = r.id ?? lastId;
      const message = r.choices?.[0]?.message;
      const requested = last ? undefined : message?.tool_calls;

      if (!requested || requested.length === 0) {
        return {
          data: { text: message?.content ?? "", calls },
          provider: this.id,
          model: this.model,
          providerRequestId: lastId,
          usage,
        };
      }

      messages.push({
        role: "assistant",
        content: message?.content ?? null,
        tool_calls: requested,
      });
      for (const call of requested) {
        const tool = byName.get(call.function.name);
        let output: unknown;
        if (!tool) {
          output = { error: "Outil inconnu." }; // jamais exécuté
        } else {
          try {
            const args = tool.parameters.parse(JSON.parse(call.function.arguments || "{}"));
            const result = await tool.execute(args);
            calls.push({ tool: tool.name, args, result });
            output = result;
          } catch (error) {
            if (error instanceof AppError) throw error; // ex. permission refusée : on s'arrête
            output = { error: "Arguments invalides." };
          }
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output),
        });
      }
    }
    throw new AppError("AI_UNAVAILABLE"); // inatteignable : la boucle retourne au dernier tour
  }
}
