import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { consumeRateLimit } from "@/server/security/rate-limit";

/**
 * Accès à l'administration de la plateforme (« Super Admin FacturDZ »), strictement séparé du
 * tableau de bord des entreprises.
 *
 * Contrôles, tous côté serveur :
 *  - `platformRole = SUPER_ADMIN` ET compte `ACTIVE`, relus EN BASE à chaque requête (jamais
 *    déduits d'un cookie ou d'un paramètre) ;
 *  - ce rôle ne s'attribue qu'en base (`pnpm admin:grant`), jamais depuis l'application ni à
 *    l'inscription (Better Auth : `platformRole` en `input: false`) ;
 *  - un `AdminContext` ne peut être produit que par `resolveAdmin` : les services d'administration
 *    l'exigent en premier argument, donc aucun appel sans vérification n'est possible ;
 *  - pour un utilisateur ordinaire, les pages répondent 404 (l'existence du panneau n'est pas
 *    révélée) et les actions répondent FORBIDDEN.
 */
declare const adminBrand: unique symbol;
export interface AdminContext {
  readonly [adminBrand]: true;
  readonly userId: string;
  readonly sessionId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export async function resolveAdmin(
  db: Db,
  input: {
    userId: string;
    sessionId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<AdminContext> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { platformRole: true, status: true },
  });
  if (!user || user.platformRole !== "SUPER_ADMIN" || user.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN");
  }
  return {
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  } as AdminContext;
}

async function fromRequest(): Promise<AdminContext> {
  const session = await getCurrentSession();
  if (!session) throw new AppError("UNAUTHENTICATED");
  const h = await headers();
  return resolveAdmin(getDb(), {
    userId: session.user.id,
    sessionId: session.sessionId,
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  });
}

/** Pour les server actions : lève UNAUTHENTICATED / FORBIDDEN. À appeler en première ligne. */
export async function requireSuperAdmin(): Promise<AdminContext> {
  const admin = await fromRequest();
  await consumeRateLimit("admin:user", admin.userId, 60, 60);
  return admin;
}

/** Pour les pages : 404 pour tout autre que le super admin. */
export async function requireSuperAdminPage(): Promise<AdminContext> {
  try {
    return await fromRequest();
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
}
