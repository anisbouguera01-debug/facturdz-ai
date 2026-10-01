import "server-only";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Appel HTTP JSON commun aux fournisseurs : délai maximal, UNE relance sur erreur réseau /
 * 408 / 429 / 5xx, et erreurs converties en AppError génériques. Le corps d'une réponse
 * d'erreur et les en-têtes (clé d'API) ne sont jamais journalisés ni renvoyés : seul le code
 * HTTP l'est.
 */
export interface HttpOptions {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export async function postJson<T>(
  provider: "openai" | "gemini",
  url: string,
  headers: Record<string, string>,
  body: unknown,
  { fetchImpl, sleep, timeoutMs }: HttpOptions,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt === 0) {
        await sleep(500);
        continue;
      }
      const timeout = (error as { name?: string }).name === "TimeoutError";
      logger.warn({ provider, timeout }, "Appel du fournisseur d'IA impossible");
      throw new AppError("AI_UNAVAILABLE", undefined, { cause: error });
    }
    if (res.ok) return (await res.json()) as T;

    if (RETRY_STATUS.has(res.status) && attempt === 0) {
      await sleep(500);
      continue;
    }
    logger.warn({ provider, status: res.status }, "Réponse d'erreur du fournisseur d'IA");
    if (res.status === 429)
      throw new AppError("RATE_LIMITED", "Le service d'IA est saturé. Réessayez dans un instant.");
    // 400/401/403/404… : configuration ou requête (clé, modèle) : indisponible pour l'utilisateur.
    throw new AppError("AI_UNAVAILABLE");
  }
  throw new AppError("AI_UNAVAILABLE");
}
