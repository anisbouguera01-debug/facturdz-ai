import "server-only";
import { serverEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Envoi d'e-mails transactionnels (vérification d'adresse, réinitialisation de mot de passe).
 *
 * Fournisseur de production : Resend (API REST, appelée avec `fetch` : aucune dépendance, même
 * approche que les fournisseurs IA). Pourquoi Resend : API minimale et stable, domaine
 * d'envoi propre (SPF/DKIM), clé limitable à l'envoi, idempotence native. Changer de fournisseur
 * = implémenter `EmailProvider` (une méthode).
 *
 * - La clé reste côté serveur (`serverEnv()`), n'est jamais journalisée ; les corps d'e-mails
 *   (qui contiennent des jetons à usage unique) ne le sont pas non plus.
 * - `log` : développement uniquement (écrit l'e-mail dans les journaux pour tester les liens) ;
 *   refusé en staging/production par la validation d'environnement.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Évite un double envoi si la requête est rejouée (en-tête `Idempotency-Key`). */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

const TIMEOUT_MS = 10_000;
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export function createResendProvider(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl = "https://api.resend.com",
): EmailProvider {
  return {
    name: "resend",
    async send(message) {
      let lastStatus = 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetchImpl(`${baseUrl}/emails`, {
            method: "POST",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
            },
            body: JSON.stringify({
              from,
              to: [message.to],
              subject: message.subject,
              html: message.html,
              text: message.text,
            }),
          });
          if (res.ok) return;
          lastStatus = res.status;
          if (!RETRYABLE.has(res.status)) break;
        } catch {
          lastStatus = 0; // réseau ou délai dépassé
        }
      }
      // Jamais le corps de la réponse ni la clé : seulement le statut.
      throw new AppError("INTERNAL_ERROR", `Envoi d'e-mail impossible (statut ${lastStatus}).`);
    },
  };
}

/** Développement : journalise l'e-mail (liens compris) au lieu de l'envoyer. */
export function createLogProvider(): EmailProvider {
  return {
    name: "log",
    async send(message) {
      logger.info({ to: message.to, subject: message.subject, text: message.text }, "E-mail (dev)");
    },
  };
}

/** Tests : conserve les e-mails en mémoire. */
export const testOutbox: EmailMessage[] = [];
export function createMemoryProvider(): EmailProvider {
  return {
    name: "memory",
    async send(message) {
      testOutbox.push(message);
    },
  };
}

const g = globalThis as unknown as { __facturdzEmail?: EmailProvider };

export function getEmailProvider(): EmailProvider {
  if (g.__facturdzEmail) return g.__facturdzEmail;
  const env = serverEnv();
  if (env.EMAIL_PROVIDER === "resend") {
    // Garanti par la validation d'environnement ; contrôle défensif.
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new AppError("INTERNAL_ERROR");
    g.__facturdzEmail = createResendProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  } else {
    g.__facturdzEmail = createLogProvider();
  }
  return g.__facturdzEmail;
}

/** Réservé aux tests : remplace le fournisseur courant. */
export function setEmailProviderForTests(provider: EmailProvider | undefined) {
  g.__facturdzEmail = provider;
}
