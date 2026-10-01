import "server-only";
import type { Prisma } from "@/server/db/client";
import { logger } from "@/server/logger";

/**
 * Journal d'activité (AuditLog).
 * - Ne jamais y mettre de secret, de mot de passe, ni le contenu complet d'un document :
 *   seulement des identifiants et un résumé utile (ex. numéro de facture, montant).
 * - Un échec d'écriture du journal ne doit pas faire échouer l'action métier,
 *   sauf si on l'appelle dans la même transaction (alors il fait partie de l'action).
 */
export type AuditAction =
  | "organization.created"
  | "organization.updated"
  | "organization.switched"
  | "member.added"
  | "member.role_changed"
  | "member.removed"
  | "customer.created"
  | "customer.updated"
  | "customer.archived"
  | "customer.restored"
  | "customer.deleted"
  | "product.created"
  | "product.updated"
  | "product.deactivated"
  | "product.reactivated"
  | "product.deleted"
  | "tax_rate.created"
  | "tax_rate.updated"
  | "tax_rate.deactivated"
  | "tax_rate.reactivated"
  | "quote.created"
  | "quote.updated"
  | "quote.sent"
  | "quote.accepted"
  | "quote.rejected"
  | "quote.duplicated"
  | "quote.deleted"
  | "quote.converted"
  | "invoice.created"
  | "invoice.updated"
  | "invoice.issued"
  | "invoice.cancelled"
  | "invoice.deleted"
  | "invoice.created_from_quote"
  | "payment.recorded"
  | "payment.voided"
  | "ai.draft_created"
  | "ai.draft_confirmed"
  | "ai.draft_discarded"
  | "ai.question"
  | "admin.role_granted"
  | "admin.role_revoked"
  | "admin.subscription_changed"
  | "admin.plan_updated"
  | "admin.limit_updated"
  | "admin.pricing_set"
  | "admin.user_suspended"
  | "admin.user_reactivated";

export interface AuditEntry {
  organizationId: string | null;
  userId: string | null;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type AuditWriter = {
  auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> };
};

export async function recordAudit(
  db: AuditWriter,
  entry: AuditEntry,
  options: { strict?: boolean } = {},
) {
  try {
    await db.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress ?? undefined,
        userAgent: entry.userAgent?.slice(0, 300) ?? undefined,
      },
    });
  } catch (error) {
    if (options.strict) throw error;
    logger.error({ err: error, action: entry.action }, "Échec d'écriture du journal d'audit");
  }
}
