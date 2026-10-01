import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation/auth";
import { getDb, type Db } from "@/server/db/client";
import { serverEnv } from "@/server/env";
import { logger } from "@/server/logger";

export const PASSWORD_MIN_LENGTH = PASSWORD_MIN;
export const PASSWORD_MAX_LENGTH = PASSWORD_MAX;

interface AuthConfig {
  db: Db;
  secret: string;
  baseURL: string;
  /** Rate limiting anti brute-force (désactivable uniquement pour certains tests). */
  rateLimit?: boolean;
}

/**
 * Fabrique de l'instance Better Auth.
 *
 * Choix de sécurité :
 * - Sessions en base, sans cache dans le cookie : chaque requête relit la session,
 *   donc une révocation ou une suppression de compte prend effet immédiatement.
 * - Mots de passe hachés avec scrypt (défaut Better Auth), 10 caractères minimum.
 * - `platformRole`, `status` et `activeOrganizationId` : `input: false`, impossibles à
 *   fixer par un utilisateur à l'inscription ou à la mise à jour du profil
 *   (empêche l'escalade de privilèges vers SUPER_ADMIN).
 * - Rate limiting stocké en base (fonctionne en serverless), règles strictes sur les
 *   points d'entrée sensibles.
 * - Cookies httpOnly + SameSite=Lax ; `Secure` automatique dès que l'URL est en HTTPS.
 * - Origines de confiance : uniquement l'URL de l'application (protection CSRF).
 */
export function createAuth({ db, secret, baseURL, rateLimit = true }: AuthConfig) {
  return betterAuth({
    appName: "FacturDZ AI",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: prismaAdapter(db, { provider: "postgresql" }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      autoSignIn: true,
      // Pas encore d'envoi d'e-mails : la vérification sera activée avec le fournisseur d'e-mail.
      requireEmailVerification: false,
    },

    user: {
      additionalFields: {
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        phone: { type: "string", required: false },
        status: {
          type: ["ACTIVE", "INVITED", "SUSPENDED"],
          required: false,
          defaultValue: "ACTIVE",
          input: false,
        },
        platformRole: {
          type: ["USER", "SUPER_ADMIN"],
          required: false,
          defaultValue: "USER",
          input: false,
        },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 jours
      updateAge: 60 * 60 * 24, // prolongée au plus une fois par jour
      cookieCache: { enabled: false },
      additionalFields: {
        activeOrganizationId: { type: "string", required: false, input: false },
      },
    },

    rateLimit: {
      enabled: rateLimit,
      storage: "database",
      modelName: "authRateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60 * 10, max: 5 },
        "/request-password-reset": { window: 60 * 10, max: 3 },
        "/get-session": false,
      },
    },

    advanced: {
      cookiePrefix: "facturdz",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      useSecureCookies: baseURL.startsWith("https://"),
    },

    databaseHooks: {
      session: {
        create: {
          // Refuse l'ouverture de session d'un compte suspendu.
          before: async (session) => {
            const user = await db.user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            if (user?.status === "SUSPENDED") return false;
            return { data: session };
          },
        },
      },
    },

    logger: {
      log: (level, message) => {
        logger[level]({ source: "better-auth" }, message);
      },
    },

    plugins: [nextCookies()], // doit rester le dernier plugin
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __facturdzAuth?: Auth };

/** Instance de l'application, créée au premier usage (pas à l'import). */
export function getAuth(): Auth {
  if (!globalForAuth.__facturdzAuth) {
    const env = serverEnv();
    globalForAuth.__facturdzAuth = createAuth({
      db: getDb(),
      secret: env.AUTH_SECRET,
      baseURL: env.NEXT_PUBLIC_APP_URL,
    });
  }
  return globalForAuth.__facturdzAuth;
}
