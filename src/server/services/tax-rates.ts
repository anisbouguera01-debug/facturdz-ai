import "server-only";
import { taxRateSchema, type TaxRateInput } from "@/lib/validation/product";
import { idSchema } from "@/lib/validation/common";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";

/**
 * Taux de TVA de l'entreprise.
 *
 * Aucun taux n'est imposé par l'application : chaque entreprise saisit les siens,
 * conformément à la réglementation en vigueur. Les produits et lignes de documents
 * enregistrent la VALEUR du taux : modifier ou désactiver un taux ne change jamais
 * un document existant.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

const select = { id: true, label: true, rate: true, isDefault: true, active: true } as const;

export type TaxRateDTO = {
  id: string;
  label: string;
  rate: string;
  isDefault: boolean;
  active: boolean;
};

const toDTO = (r: {
  id: string;
  label: string;
  rate: { toFixed(n: number): string };
  isDefault: boolean;
  active: boolean;
}): TaxRateDTO => ({
  ...r,
  rate: r.rate.toFixed(2),
});

export async function listTaxRates(ctx: Ctx, options: { includeInactive?: boolean } = {}) {
  assertPermission(ctx, "products:read");
  const rows = await ctx.db.taxRate.findMany({
    where: options.includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { isDefault: "desc" }, { rate: "desc" }],
    select,
  });
  return rows.map(toDTO);
}

async function assertNoDuplicateRate(ctx: Ctx, rate: string, exceptId?: string) {
  const dup = await ctx.db.taxRate.findFirst({
    where: { rate, active: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { label: true },
  });
  if (dup) {
    throw new AppError("CONFLICT", `Ce taux existe déjà (« ${dup.label} »).`, {
      fieldErrors: { rate: ["Ce taux existe déjà."] },
    });
  }
}

export async function createTaxRate(ctx: Ctx, input: TaxRateInput): Promise<TaxRateDTO> {
  assertPermission(ctx, "settings:manage");
  const data = taxRateSchema.parse(input);
  await assertNoDuplicateRate(ctx, data.rate);

  const created = await ctx.db.$transaction(async (tx) => {
    const activeCount = await tx.taxRate.count({ where: { active: true } });
    const isDefault = data.isDefault || activeCount === 0; // le premier taux devient le taux par défaut
    if (isDefault)
      await tx.taxRate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    return tx.taxRate.create({
      data: { organizationId: ctx.organizationId, label: data.label, rate: data.rate, isDefault },
      select,
    });
  });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "tax_rate.created",
    entity: "TaxRate",
    entityId: created.id,
    metadata: { label: created.label, rate: created.rate.toFixed(2) },
  });
  return toDTO(created);
}

export async function updateTaxRate(
  ctx: Ctx,
  id: string,
  input: TaxRateInput,
): Promise<TaxRateDTO> {
  assertPermission(ctx, "settings:manage");
  const taxRateId = idSchema.parse(id);
  const data = taxRateSchema.parse(input);
  const existing = await ctx.db.taxRate.findUnique({ where: { id: taxRateId }, select });
  if (!existing) throw new AppError("NOT_FOUND", "Taux introuvable.");
  if (existing.active) await assertNoDuplicateRate(ctx, data.rate, taxRateId);

  const updated = await ctx.db.$transaction(async (tx) => {
    if (data.isDefault && existing.active) {
      await tx.taxRate.updateMany({
        where: { isDefault: true, id: { not: taxRateId } },
        data: { isDefault: false },
      });
    }
    return tx.taxRate.update({
      where: { id: taxRateId },
      data: {
        label: data.label,
        rate: data.rate,
        isDefault: existing.active ? data.isDefault : false,
      },
      select,
    });
  });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "tax_rate.updated",
    entity: "TaxRate",
    entityId: taxRateId,
    metadata: { before: existing.rate.toFixed(2), after: updated.rate.toFixed(2) },
  });
  return toDTO(updated);
}

/** Désactive (ou réactive) un taux : il n'est plus proposé, les documents existants ne changent pas. */
export async function setTaxRateActive(ctx: Ctx, id: string, active: boolean) {
  assertPermission(ctx, "settings:manage");
  const taxRateId = idSchema.parse(id);
  const existing = await ctx.db.taxRate.findUnique({ where: { id: taxRateId }, select });
  if (!existing) throw new AppError("NOT_FOUND", "Taux introuvable.");
  if (active) await assertNoDuplicateRate(ctx, existing.rate.toFixed(2), taxRateId);
  await ctx.db.taxRate.update({
    where: { id: taxRateId },
    data: { active, ...(active ? {} : { isDefault: false }) },
  });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: active ? "tax_rate.reactivated" : "tax_rate.deactivated",
    entity: "TaxRate",
    entityId: taxRateId,
  });
}
