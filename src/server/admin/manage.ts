import "server-only";
import { z } from "zod";
import { setModelPricing, type PricingInput } from "@/server/ai/pricing-admin";
import { getDb, type Db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { recordAudit, type AuditAction } from "@/server/services/audit";
import type { AdminContext } from "./context";

/**
 * Actions d'administration de la plateforme (écritures). Chaque fonction exige un `AdminContext`
 * (voir context.ts), valide ses entrées avec Zod et laisse une trace dans le journal d'activité
 * (`admin.*`). Ce module est le SEUL endroit, avec overview.ts, qui lit/écrit entre entreprises :
 * le lint interdit de l'importer en dehors de src/app/admin et src/server/admin.
 */
const LIMIT_KEYS = [
  "INVOICES_PER_MONTH",
  "QUOTES_PER_MONTH",
  "MEMBERS",
  "STORAGE_MB",
  "AI_REQUESTS_PER_MONTH",
  "AI_TOKENS_PER_MONTH",
  "AI_BUDGET_USD_PER_MONTH",
] as const;
export type AdminLimitKey = (typeof LIMIT_KEYS)[number];
const DECIMAL_KEYS: AdminLimitKey[] = ["AI_BUDGET_USD_PER_MONTH"];

const idSchema = z.string().min(1).max(64);

async function audit(
  db: Db,
  admin: AdminContext,
  action: AuditAction,
  entityId: string,
  organizationId: string | null,
  metadata?: Record<string, string | number | boolean | null>,
) {
  await recordAudit(
    db,
    {
      organizationId,
      userId: admin.userId,
      action,
      entity: "Admin",
      entityId,
      metadata,
      ipAddress: admin.ipAddress,
      userAgent: admin.userAgent,
    },
    { strict: true },
  );
}

/* ───────────────────────── Abonnement d'une entreprise ───────────────────────── */

const subscriptionSchema = z.object({
  organizationId: idSchema,
  planCode: z.string().min(1).max(40).optional(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
});

export async function setOrganizationSubscription(
  admin: AdminContext,
  input: z.input<typeof subscriptionSchema>,
  db: Db = getDb(),
) {
  const data = subscriptionSchema.parse(input);
  if (!data.planCode && !data.status)
    throw new AppError("VALIDATION_ERROR", "Indiquez un plan ou un statut.");
  return db.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: data.organizationId },
      select: { id: true },
    });
    if (!org) throw new AppError("NOT_FOUND", "Entreprise introuvable.");
    const plan = data.planCode
      ? await tx.subscriptionPlan.findUnique({ where: { code: data.planCode } })
      : null;
    if (data.planCode && (!plan || !plan.active))
      throw new AppError("VALIDATION_ERROR", "Plan inconnu ou désactivé.");

    const existing = await tx.subscription.findUnique({ where: { organizationId: org.id } });
    if (!existing && !plan)
      throw new AppError(
        "VALIDATION_ERROR",
        "Cette entreprise n'a pas d'abonnement : choisissez un plan.",
      );
    const now = new Date();
    const sub = existing
      ? await tx.subscription.update({
          where: { organizationId: org.id },
          data: {
            ...(plan ? { planId: plan.id } : {}),
            ...(data.status ? { status: data.status } : {}),
          },
          select: { id: true, status: true, plan: { select: { code: true } } },
        })
      : await tx.subscription.create({
          data: {
            organizationId: org.id,
            planId: plan!.id,
            status: data.status ?? "ACTIVE",
            currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
            currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
          select: { id: true, status: true, plan: { select: { code: true } } },
        });
    await audit(tx as unknown as Db, admin, "admin.subscription_changed", org.id, org.id, {
      plan: sub.plan.code,
      status: sub.status,
    });
    return { plan: sub.plan.code, status: sub.status };
  });
}

/* ───────────────────────────── Plans et limites ───────────────────────────── */

const planSchema = z.object({
  planId: idSchema,
  name: z.string().trim().min(1).max(60),
  priceMonthly: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Prix invalide."),
  active: z.boolean(),
});

export async function updatePlan(
  admin: AdminContext,
  input: z.input<typeof planSchema>,
  db: Db = getDb(),
) {
  const data = planSchema.parse(input);
  const plan = await db.subscriptionPlan.findUnique({ where: { id: data.planId } });
  if (!plan) throw new AppError("NOT_FOUND", "Plan introuvable.");
  // Le plan FREE est attribué à toute nouvelle entreprise : on ne le désactive jamais.
  if (plan.code === "FREE" && !data.active)
    throw new AppError(
      "VALIDATION_ERROR",
      "Le plan FREE (plan par défaut) ne peut pas être désactivé.",
    );
  await db.subscriptionPlan.update({
    where: { id: plan.id },
    data: { name: data.name, priceMonthly: data.priceMonthly, active: data.active },
  });
  await audit(db, admin, "admin.plan_updated", plan.id, null, {
    code: plan.code,
    active: data.active,
  });
}

const limitSchema = z.object({
  planId: idSchema,
  key: z.enum(LIMIT_KEYS),
  /** null = illimité. */
  value: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, "Valeur invalide (nombre positif).")
    .nullable(),
});

export async function setPlanLimit(
  admin: AdminContext,
  input: z.input<typeof limitSchema>,
  db: Db = getDb(),
) {
  const data = limitSchema.parse(input);
  if (data.value !== null && !DECIMAL_KEYS.includes(data.key) && data.value.includes("."))
    throw new AppError("VALIDATION_ERROR", "Cette limite doit être un nombre entier.");
  const plan = await db.subscriptionPlan.findUnique({ where: { id: data.planId } });
  if (!plan) throw new AppError("NOT_FOUND", "Plan introuvable.");
  await db.usageLimit.upsert({
    where: { planId_key: { planId: plan.id, key: data.key } },
    update: { value: data.value },
    create: { planId: plan.id, key: data.key, value: data.value },
  });
  await audit(db, admin, "admin.limit_updated", plan.id, null, {
    plan: plan.code,
    key: data.key,
    value: data.value,
  });
}

/* ───────────────────────────── Tarifs des modèles IA ───────────────────────────── */

export async function setAiPricing(admin: AdminContext, input: PricingInput, db: Db = getDb()) {
  const row = await setModelPricing(db, input);
  await audit(db, admin, "admin.pricing_set", row.id, null, {
    provider: row.provider,
    model: row.model,
  });
  return row;
}

/* ───────────────────────────── Utilisateurs ───────────────────────────── */

export async function setUserStatus(
  admin: AdminContext,
  input: { userId: string; status: "ACTIVE" | "SUSPENDED" },
  db: Db = getDb(),
) {
  const data = z.object({ userId: idSchema, status: z.enum(["ACTIVE", "SUSPENDED"]) }).parse(input);
  if (data.userId === admin.userId)
    throw new AppError("VALIDATION_ERROR", "Vous ne pouvez pas suspendre votre propre compte.");
  const user = await db.user.findUnique({
    where: { id: data.userId },
    select: { id: true, platformRole: true },
  });
  if (!user) throw new AppError("NOT_FOUND", "Utilisateur introuvable.");
  if (user.platformRole === "SUPER_ADMIN")
    throw new AppError("FORBIDDEN", "Un administrateur de la plateforme ne se suspend pas ici.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { status: data.status } });
    // Une suspension coupe aussi les sessions ouvertes (en plus du refus à chaque requête).
    if (data.status === "SUSPENDED") await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(
      tx as unknown as Db,
      admin,
      data.status === "SUSPENDED" ? "admin.user_suspended" : "admin.user_reactivated",
      user.id,
      null,
    );
  });
}
