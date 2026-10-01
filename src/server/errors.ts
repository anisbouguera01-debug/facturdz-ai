import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { logger } from "./logger";

/**
 * Système d'erreurs unifié.
 *
 * - `AppError` : erreur métier attendue, dont le message est sûr à afficher.
 * - Toute autre erreur (Prisma, réseau, bug) est journalisée côté serveur avec
 *   un `errorId`, et l'utilisateur ne reçoit qu'un message générique + cet ID.
 *   Jamais de stack trace, d'erreur SQL ni de secret côté client.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LIMIT_EXCEEDED: 402,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Certaines informations sont invalides.",
  UNAUTHENTICATED: "Veuillez vous connecter.",
  FORBIDDEN: "Vous n'avez pas l'autorisation d'effectuer cette action.",
  NOT_FOUND: "Élément introuvable.",
  CONFLICT: "Cette opération entre en conflit avec des données existantes.",
  LIMIT_EXCEEDED: "La limite de votre abonnement est atteinte.",
  RATE_LIMITED: "Trop de requêtes. Réessayez dans quelques instants.",
  AI_UNAVAILABLE: "L'assistant IA est momentanément indisponible.",
  INTERNAL_ERROR: "Une erreur inattendue est survenue.",
};

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { fieldErrors?: FieldErrors; cause?: unknown },
  ) {
    super(message ?? DEFAULT_MESSAGES[code], { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CODES[code];
    this.fieldErrors = options?.fieldErrors;
  }
}

/** Forme unique des erreurs renvoyées au client (API et server actions). */
export interface PublicError {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
  errorId?: string;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: PublicError };

function zodToFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Convertit n'importe quelle erreur en erreur publique sûre (et journalise). */
export function toPublicError(error: unknown, context: Record<string, unknown> = {}): PublicError {
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error({ ...context, err: error }, error.message);
    return { code: error.code, message: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: DEFAULT_MESSAGES.VALIDATION_ERROR,
      fieldErrors: zodToFieldErrors(error),
    };
  }
  const errorId = randomUUID();
  logger.error({ ...context, errorId, err: error }, "Erreur non gérée");
  return { code: "INTERNAL_ERROR", message: DEFAULT_MESSAGES.INTERNAL_ERROR, errorId };
}

/** Enveloppe une server action : retourne toujours un `ActionResult`, jamais d'exception brute. */
export async function safeAction<T>(
  fn: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: toPublicError(error, context) };
  }
}

/** Réponse JSON d'erreur cohérente pour les Route Handlers. */
export function errorResponse(error: unknown, context: Record<string, unknown> = {}): Response {
  const publicError = toPublicError(error, context);
  return Response.json({ error: publicError }, { status: ERROR_CODES[publicError.code] });
}
