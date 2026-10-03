import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation/auth";
import { getDb, type Db } from "@/server/db/client";
import { getEmailProvider, type EmailMessage } from "@/server/email/provider";
import {
  passwordChangedEmail,
  resetPasswordEmail,
  verificationEmail,
  type RenderedEmail,
} from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { logger } from "@/server/logger";

export const PASSWORD_MIN_LENGTH = PASSWORD_MIN;
export const PASSWORD_MAX_LENGTH = PASSWORD_MAX;

export const VERIFICATION_TTL_SECONDS = 60 * 60 * 24; // 24 h
export const RESET_TTL_SECONDS = 60 * 60; // 1 h

interface AuthConfig {
  db: Db;
  secret: string;
  baseURL: string;
  /** Rate limiting anti brute-force (désactivable uniquement pour certains tests). */
  rateLimit?: boolean;
  /**
   * Exige une adresse e-mail vérifiée pour ouvrir une session. Actif en staging/production ;
   * inactif en développement local (comptes de démo, e-mails écrits dans les journaux).
   */
  requireEmailVerification?: boolean;
  /** Envoi d'e-mail (injectable pour les tests). Par défaut : fournisseur de l'environnement. */
  mailer?: (message: EmailMessage) => Promise<void>;
}

const pendingMail = new Set<Promise<void>>();

/**
 * Envoie l'e-mail EN ARRIÈRE-PLAN : la réponse HTTP ne dépend ni de la durée ni du succès de
 * l'envoi, ce qui évite de révéler par le temps de réponse si une adresse existe (énumération de
 * comptes). Les échecs sont journalisés (sans corps ni jeton). Hors requête Next.js (tests,
 * scripts), la tâche est suivie par `flushPendingMail()`.
 */
function deliver(
  mailer: NonNullable<AuthConfig["mailer"]>,
  to: string,
  rendered: RenderedEmail,
  key: string,
) {
  const task = async () => {
    try {
      await mailer({ to, ...rendered, idempotencyKey: key });
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : "inconnue", subject: rendered.subject },
        "Échec d'envoi d'e-mail",
      );
    }
  };
  try {
    after(task);
  } catch {
    const p = task().finally(() => pendingMail.delete(p));
    pendingMail.add(p);
  }
}

/** Réservé aux tests : attend les envois lancés hors requête. */
export async function flushPendingMail() {
  await Promise.all([...pendingMail]);
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
export function createAuth({
  db,
  secret,
  baseURL,
  rateLimit = true,
  requireEmailVerification = false,
  mailer = (m) => getEmailProvider().send(m),
}: AuthConfig) {
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
      requireEmailVerification,
      // Réinitialisation : lien à usage unique valable 1 h ; toutes les sessions sont fermées
      // après le changement, et l'utilisateur est prévenu par e-mail.
      resetPasswordTokenExpiresIn: RESET_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        deliver(
          mailer,
          user.email,
          resetPasswordEmail({ name: user.name, url, expiresInMinutes: RESET_TTL_SECONDS / 60 }),
          `reset-${token.slice(0, 24)}`,
        );
      },
      onPasswordReset: async ({ user }) => {
        deliver(
          mailer,
          user.email,
          passwordChangedEmail({ name: user.name, loginUrl: `${baseURL}/login` }),
          `pwchanged-${user.id}-${Date.now()}`,
        );
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true, // un compte non vérifié qui se connecte reçoit un nouveau lien
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_TTL_SECONDS,
      sendVerificationEmail: async ({ user, url, token }) => {
        deliver(
          mailer,
          user.email,
          verificationEmail({
            name: user.name,
            url,
            expiresInHours: VERIFICATION_TTL_SECONDS / 3600,
          }),
          `verify-${token.slice(0, 24)}`,
        );
      },
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
        "/reset-password": { window: 60 * 10, max: 5 },
        "/send-verification-email": { window: 60 * 10, max: 3 },
        "/verify-email": { window: 60, max: 10 },
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
      // Staging et production : adresse vérifiée obligatoire.
      requireEmailVerification: env.APP_ENV !== "development",
    });
  }
  return globalForAuth.__facturdzAuth;
}
