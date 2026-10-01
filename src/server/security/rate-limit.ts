import "server-only";
import { Prisma, getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";

/**
 * Limiteur de débit à fenêtre fixe, stocké en base (table globale `rate_limit_buckets`) :
 * fonctionne à plusieurs instances. L'incrément est atomique (INSERT … ON CONFLICT).
 * Clé = « <portée>:<identifiant>:<fenêtre> » ; les compteurs expirés sont purgés au passage.
 */
export async function consumeRateLimit(
  scope: string,
  id: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
  message = "Trop de demandes. Réessayez dans une minute.",
): Promise<void> {
  const windowStart = Math.floor(now.getTime() / 1000 / windowSeconds);
  const key = `${scope}:${id}:${windowStart}`;
  const expiresAt = new Date((windowStart + 1) * windowSeconds * 1000 + 60_000);
  const db = getDb();
  const rows = await db.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "rate_limit_buckets" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "rate_limit_buckets"."count" + 1
    RETURNING "count"`);
  if (Math.random() < 0.02) {
    await db.rateLimitBucket
      .deleteMany({ where: { expiresAt: { lt: now } } })
      .catch(() => undefined);
  }
  if ((rows[0]?.count ?? 1) > limit) {
    throw new AppError("RATE_LIMITED", message);
  }
}
