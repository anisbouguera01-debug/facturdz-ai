import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Permission } from "@/lib/permissions";
import { getCurrentSession, requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import type { Actor } from "@/server/services/organizations";
import { assertPermission, resolveTenantContext, type ResolveResult } from "./resolve";

export type { TenantContext } from "./resolve";

const resolveForRequest = cache(async (): Promise<ResolveResult | null> => {
  const session = await getCurrentSession();
  if (!session) return null;
  return resolveTenantContext(getDb(), {
    userId: session.user.id,
    sessionId: session.sessionId,
    activeOrganizationId: session.activeOrganizationId,
  });
});

/**
 * Pour les PAGES : contexte de l'organisation active.
 * Sans session → /login ; sans organisation → /onboarding.
 */
export async function requireTenantPage(nextPath?: string) {
  await requireSession(nextPath);
  const result = await resolveForRequest();
  if (!result || result.status === "no-organization") redirect("/onboarding");
  return result;
}

/**
 * Pour les SERVER ACTIONS et ROUTES : contexte + permission, sinon AppError
 * (UNAUTHENTICATED, FORBIDDEN). À appeler au début de CHAQUE action : le proxy
 * ne protège pas les server actions.
 */
export async function requireTenant(permission?: Permission) {
  const result = await resolveForRequest();
  if (!result) throw new AppError("UNAUTHENTICATED");
  if (result.status === "no-organization") {
    throw new AppError("FORBIDDEN", "Créez ou rejoignez une entreprise pour continuer.");
  }
  if (permission) assertPermission(result.context, permission);
  return result.context;
}

/** Acteur courant (utilisateur + session + IP/UA) pour les services et l'audit. */
export async function currentActor(): Promise<Actor> {
  const session = await getCurrentSession();
  if (!session) throw new AppError("UNAUTHENTICATED");
  const h = await headers();
  return {
    userId: session.user.id,
    sessionId: session.sessionId,
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}
