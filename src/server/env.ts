import "server-only";
import { z } from "zod";

// Staging et production : configuration stricte (échec au démarrage plutôt qu'au premier incident).
const PLACEHOLDER_SECRET =
  /change|example|exemple|placeholder|ci-only|not-used|secret-secret|(.)\1{9,}/i;
const hosted = (e: { APP_ENV: string }) => e.APP_ENV === "staging" || e.APP_ENV === "production";

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
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit contenir au moins 32 caractères"),

    // « mock » = fournisseur de démonstration, refusé en production (voir refine ci-dessous).
    AI_PROVIDER: z.enum(["openai", "gemini", "mock"]).default("openai"),
    AI_MODEL: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),

    NEXT_PUBLIC_APP_URL: z.url(),
  })
  // `next start` impose NODE_ENV=production même en local : le garde-fou porte donc sur APP_ENV,
  // qui désigne l'environnement de déploiement réel.
  .refine((e) => !(e.AI_PROVIDER === "mock" && e.APP_ENV === "production"), {
    path: ["AI_PROVIDER"],
    message: "« mock » est interdit en production (APP_ENV=production)",
  })
  .superRefine((e, ctx) => {
    if (!hosted(e)) return;
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (new URL(e.NEXT_PUBLIC_APP_URL).protocol !== "https:")
      issue("NEXT_PUBLIC_APP_URL", "doit être en https en staging et en production");
    if (PLACEHOLDER_SECRET.test(e.AUTH_SECRET))
      issue(
        "AUTH_SECRET",
        "ressemble à une valeur d'exemple : générez-en une (openssl rand -base64 32)",
      );
    if (e.AI_PROVIDER !== "mock") {
      if (!e.AI_MODEL) issue("AI_MODEL", "obligatoire (aucun modèle par défaut)");
      if (e.AI_PROVIDER === "openai" && !e.OPENAI_API_KEY)
        issue("OPENAI_API_KEY", "obligatoire avec AI_PROVIDER=openai");
      if (e.AI_PROVIDER === "gemini" && !e.GEMINI_API_KEY)
        issue("GEMINI_API_KEY", "obligatoire avec AI_PROVIDER=gemini");
    }
    if (e.DATABASE_URL.includes("localhost") || e.DATABASE_URL.includes("127.0.0.1"))
      issue("DATABASE_URL", "pointe vers localhost : base managée attendue");
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
