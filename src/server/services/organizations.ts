import "server-only";
import { randomBytes } from "node:crypto";
import {
  createOrganizationSchema,
  type CreateOrganizationInput,
} from "@/lib/validation/organization";
import type { Db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { recordAudit } from "./audit";

export interface Actor {
  userId: string;
  sessionId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** « Atlas Informatique SARL » → « atlas-informatique-sarl-k3f9qa » (suffixe aléatoire). */
export function makeSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(4)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  return `${base || "entreprise"}-${suffix}`;
}

/**
 * Crée une organisation dont l'utilisateur devient propriétaire, puis l'active
 * dans sa session. Tout est fait dans une seule transaction.
 *
 * Aucune règle fiscale n'est créée ici : les taux de TVA se configurent dans
 * les paramètres de l'entreprise.
 */
export async function createOrganization(db: Db, actor: Actor, input: CreateOrganizationInput) {
  const data = createOrganizationSchema.parse(input);
  const year = new Date().getFullYear();

  const org = await db.$transaction(async (tx) => {
    const freePlan = await tx.subscriptionPlan.findUnique({ where: { code: "FREE" } });
    if (!freePlan) {
      logger.warn("Plan FREE introuvable : organisation créée sans abonnement");
    }
    const now = new Date();

    const created = await tx.organization.create({
      data: {
        ...data,
        slug: makeSlug(data.name),
        members: { create: { userId: actor.userId, role: "OWNER" } },
        sequences: {
          create: [
            { documentType: "INVOICE", year, prefix: "FAC" },
            { documentType: "QUOTE", year, prefix: "DEV" },
          ],
        },
        ...(freePlan
          ? {
              subscription: {
                create: {
                  planId: freePlan.id,
                  status: "ACTIVE",
                  currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
                  currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
                },
              },
            }
          : {}),
      },
    });

    // La session doit appartenir à l'acteur : sinon on n'active rien.
    const updated = await tx.session.updateMany({
      where: { id: actor.sessionId, userId: actor.userId },
      data: { activeOrganizationId: created.id },
    });
    if (updated.count !== 1) throw new AppError("UNAUTHENTICATED");

    await recordAudit(
      tx,
      {
        organizationId: created.id,
        userId: actor.userId,
        action: "organization.created",
        entity: "Organization",
        entityId: created.id,
        metadata: { name: created.name },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      { strict: true },
    );
    return created;
  });

  return { id: org.id, name: org.name, slug: org.slug };
}

/**
 * Change l'organisation active de la session. Refusé si l'utilisateur n'en est
 * pas membre ; la réponse ne révèle pas si l'organisation existe.
 */
export async function switchOrganization(db: Db, actor: Actor, organizationId: string) {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: actor.userId } },
    select: { organizationId: true },
  });
  if (!membership) throw new AppError("NOT_FOUND", "Organisation introuvable.");

  const updated = await db.session.updateMany({
    where: { id: actor.sessionId, userId: actor.userId },
    data: { activeOrganizationId: organizationId },
  });
  if (updated.count !== 1) throw new AppError("UNAUTHENTICATED");

  await recordAudit(db, {
    organizationId,
    userId: actor.userId,
    action: "organization.switched",
    entity: "Organization",
    entityId: organizationId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}
