import "server-only";
import { z } from "zod";

/**
 * Variables d'environnement serveur, validées par Zod.
 *
 * - Lecture paresseuse : `next build` ne plante pas si une variable n'est utile
 *   qu'à l'exécution. La validation a lieu au premier appel de `serverEnv()`.
 * - Seul ce module lit `process.env` pour les secrets (recommandation Next.js :
 *   la couche d'accès aux données est la seule à toucher aux secrets).
 * - Les clés IA sont optionnelles ici ; leur présence est vérifiée au moment
 *   où le fournisseur correspondant est réellement instancié.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit contenir au moins 32 caractères"),

  AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  AI_MODEL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),

  NEXT_PUBLIC_APP_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Analyse un objet d'environnement. Exporté pour les tests. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  // Les chaînes vides (`KEY=`) sont traitées comme absentes.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = serverEnvSchema.safeParse(cleaned);
  if (!result.success) {
    // On liste les variables fautives, jamais leurs valeurs.
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration d'environnement invalide :\n${issues}`);
  }
  return result.data;
}

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
