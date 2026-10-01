import "server-only";
import { z, type ZodType } from "zod";
import { AppError } from "@/server/errors";
import type { AIProvider, AIRequest, AIResult, AITool, AIToolCall, AIUsageReport } from "../types";
import { postJson } from "./http";

/**
 * Fournisseur Google Gemini (API REST generateContent) via `fetch` : aucune dépendance ajoutée.
 * Mêmes garanties que le fournisseur OpenAI (voir `http.ts`) : clé serveur uniquement, envoyée
 * dans l'en-tête `x-goog-api-key` (jamais dans l'URL, qui peut être journalisée), délai maximal,
 * une relance, aucun corps d'erreur journalisé. La validation des sorties reste faite par Zod.
 */
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_TIMEOUT_MS = 30_000;
export const MAX_TOOL_ROUNDS = 4;

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface Part {
  text?: string;
  functionCall?: { name: string; args?: unknown };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}
interface GenerateResponse {
  responseId?: string;
  candidates?: { content?: { parts?: Part[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

/**
 * Gemini n'accepte qu'un sous-ensemble de JSON Schema : on retire les mots-clés non pris en
 * charge (`$schema`, `additionalProperties`…) produits par la conversion depuis Zod.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "$schema" || k === "additionalProperties" || k === "$id") continue;
      out[k] = toGeminiSchema(v);
    }
    return out;
  }
  return schema;
}

const textOf = (r: GenerateResponse) =>
  (r.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

export class GeminiProvider implements AIProvider {
  readonly id = "GEMINI" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: GeminiOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? GEMINI_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? GEMINI_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private generate(body: Record<string, unknown>): Promise<GenerateResponse> {
    return postJson<GenerateResponse>(
      "gemini",
      `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.apiKey },
      body,
      { fetchImpl: this.fetchImpl, sleep: this.sleep, timeoutMs: this.timeoutMs },
    );
  }

  private static usage(r: GenerateResponse): AIUsageReport {
    const u = r.usageMetadata;
    return {
      inputTokens: u?.promptTokenCount ?? 0,
      cachedInputTokens: u?.cachedContentTokenCount ?? 0,
      // Les jetons de « réflexion » sont facturés comme des jetons de sortie.
      outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    };
  }

  private static sum(a: AIUsageReport, b: AIUsageReport): AIUsageReport {
    return {
      inputTokens: a.inputTokens + b.inputTokens,
      cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
      outputTokens: a.outputTokens + b.outputTokens,
    };
  }

  private static base(req: AIRequest, config: Record<string, unknown> = {}) {
    const contents: Content[] = [{ role: "user", parts: [{ text: req.user }] }];
    if (req.correction) contents.push({ role: "user", parts: [{ text: req.correction }] });
    return {
      systemInstruction: { parts: [{ text: req.system }] },
      contents,
      generationConfig: {
        ...config,
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
      },
    };
  }

  async generateText(req: AIRequest): Promise<AIResult<string>> {
    const r = await this.generate(GeminiProvider.base(req));
    return {
      data: textOf(r),
      provider: this.id,
      model: this.model,
      providerRequestId: r.responseId,
      usage: GeminiProvider.usage(r),
    };
  }

  async generateStructuredOutput<T>(
    req: AIRequest,
    schema: ZodType<T>,
    meta?: { name: string },
  ): Promise<AIResult<unknown>> {
    void schema;
    void meta;
    const r = await this.generate(
      GeminiProvider.base(req, { responseMimeType: "application/json" }),
    );
    const content = textOf(r);
    let data: unknown = content;
    try {
      data = JSON.parse(content);
    } catch {
      /* laissé tel quel : sera rejeté par la validation Zod */
    }
    return {
      data,
      provider: this.id,
      model: this.model,
      providerRequestId: r.responseId,
      usage: GeminiProvider.usage(r),
    };
  }

  async generateWithTools(
    req: AIRequest,
    tools: AITool[],
  ): Promise<AIResult<{ text: string; calls: AIToolCall[] }>> {
    const byName = new Map(tools.map((t) => [t.name, t]));
    const declarations = tools.map((t) => {
      const parameters = toGeminiSchema(z.toJSONSchema(t.parameters)) as {
        properties?: Record<string, unknown>;
      };
      return {
        name: t.name,
        description: t.description,
        // Gemini refuse un objet sans propriété : on omet alors `parameters`.
        ...(parameters.properties && Object.keys(parameters.properties).length > 0
          ? { parameters }
          : {}),
      };
    });
    const base = GeminiProvider.base(req);
    const contents = base.contents;
    const calls: AIToolCall[] = [];
    let usage: AIUsageReport = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    let lastId: string | undefined;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const last = round === MAX_TOOL_ROUNDS;
      const r = await this.generate({
        ...base,
        contents,
        ...(last ? {} : { tools: [{ functionDeclarations: declarations }] }),
      });
      usage = GeminiProvider.sum(usage, GeminiProvider.usage(r));
      lastId = r.responseId ?? lastId;
      const parts = r.candidates?.[0]?.content?.parts ?? [];
      const requested = last ? [] : parts.filter((p) => p.functionCall);

      if (requested.length === 0) {
        return {
          data: { text: textOf(r), calls },
          provider: this.id,
          model: this.model,
          providerRequestId: lastId,
          usage,
        };
      }

      contents.push({ role: "model", parts });
      const responses: Part[] = [];
      for (const part of requested) {
        const name = part.functionCall!.name;
        const tool = byName.get(name);
        let output: unknown;
        if (!tool) {
          output = { error: "Outil inconnu." }; // jamais exécuté
        } else {
          try {
            const args = tool.parameters.parse(part.functionCall!.args ?? {});
            const result = await tool.execute(args);
            calls.push({ tool: tool.name, args, result });
            output = result;
          } catch (error) {
            if (error instanceof AppError) throw error; // ex. permission refusée : on s'arrête
            output = { error: "Arguments invalides." };
          }
        }
        // `response` doit être un objet.
        responses.push({
          functionResponse: {
            name,
            response: { result: output } as Record<string, unknown>,
          },
        });
      }
      contents.push({ role: "user", parts: responses });
    }
    throw new AppError("AI_UNAVAILABLE"); // inatteignable
  }
}
