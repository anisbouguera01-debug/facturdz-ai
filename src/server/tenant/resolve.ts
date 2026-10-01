import "server-only";
import { can, permissionsFor, type Permission, type Role } from "@/lib/permissions";
import type { Db } from "@/server/db/client";
import { forTenant, type TenantDb } from "@/server/db/tenant";
import { AppError } from "@/server/errors";

export interface TenantContext {
  userId: string;
  sessionId: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  permissions: ReadonlySet<Permission>;
  /** Client de données limité à cette organisation. */
  db: TenantDb;
}

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  role: Role;
}

export type ResolveResult =
  | { status: "ok"; context: TenantContext; memberships: MembershipSummary[] }
  | { status: "no-organization" };

/**
 * Construit le contexte tenant à partir d'une session DÉJÀ authentifiée.
 *
 * L'organisation active stockée dans la session n'est qu'une préférence : l'appartenance
 * est revérifiée en base à chaque appel. Si l'utilisateur a été retiré de
 * l'organisation, l'accès est perdu immédiatement et une autre de ses organisations
 * est sélectionnée (ou aucune).
 */
export async function resolveTenantContext(
  db: Db,
  session: { userId: string; sessionId: string; activeOrganizationId: string | null },
): Promise<ResolveResult> {
  const memberships = await db.organizationMember.findMany({
    where: { userId: session.userId },
    select: { organizationId: true, role: true, organization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return { status: "no-organization" };

  const active =
    memberships.find((m) => m.organizationId === session.activeOrganizationId) ?? memberships[0];

  if (active.organizationId !== session.activeOrganizationId) {
    await db.session.updateMany({
      where: { id: session.sessionId, userId: session.userId },
      data: { activeOrganizationId: active.organizationId },
    });
  }

  const role = active.role as Role;
  return {
    status: "ok",
    context: {
      userId: session.userId,
      sessionId: session.sessionId,
      organizationId: active.organizationId,
      organizationName: active.organization.name,
      role,
      permissions: permissionsFor(role),
      db: forTenant(db, active.organizationId),
    },
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.organization.name,
      role: m.role as Role,
    })),
  };
}

/** Lève FORBIDDEN si le rôle courant n'a pas la permission. */
export function assertPermission(ctx: Pick<TenantContext, "role">, permission: Permission) {
  if (!can(ctx.role, permission)) throw new AppError("FORBIDDEN");
}
