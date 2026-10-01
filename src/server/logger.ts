import "server-only";
import pino from "pino";

/**
 * Chemins masqués dans tous les logs : secrets, jetons, mots de passe, en-têtes
 * d'authentification. Toute nouvelle donnée sensible doit être ajoutée ici.
 */
export const REDACT_PATHS = [
  "password",
  "*.password",
  "passwordHash",
  "*.passwordHash",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "idToken",
  "*.idToken",
  "apiKey",
  "*.apiKey",
  "secret",
  "*.secret",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "AUTH_SECRET",
  "DATABASE_URL",
];

export function createLogger(options: pino.LoggerOptions = {}) {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "facturdz", env: process.env.APP_ENV ?? "development" },
    redact: { paths: REDACT_PATHS, censor: "[MASQUÉ]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...options,
  });
}

export const logger = createLogger();
