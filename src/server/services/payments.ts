import "server-only";
import { isoToDate, todayISO } from "@/lib/dates";
import type { InvoiceStatus } from "@/lib/invoice-status";
import { Money } from "@/lib/money";
import { idSchema } from "@/lib/validation/common";
import {
  paymentListSchema,
  paymentSchema,
  voidPaymentSchema,
  type PaymentInput,
  type PaymentListParams,
} from "@/lib/validation/payment";
import { Prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";

/**
 * Service Paiements.
 * - Un paiement porte sur une facture émise (ou payée en partie) ; jamais sur un brouillon,
 *   une facture annulée ou déjà soldée.
 * - Le montant ne peut pas dépasser le reste à payer (pas de surpaiement).
 * - Un paiement n'est jamais supprimé : il est ANNULÉ avec un motif (trace conservée).
 * - `amountPaid` et le statut de la facture sont RECALCULÉS à partir des paiements non
 *   annulés, dans la même transaction, après avoir verrouillé la ligne de la facture : deux
 *   paiements simultanés sont sérialisés et ne peuvent pas dépasser le total ensemble.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;
type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const OPEN_STATUSES: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID"];

const audit = (
  ctx: Ctx,
  action: Parameters<typeof recordAudit>[1]["action"],
  entityId: string,
  metadata?: Prisma.InputJsonValue,
) =>
  recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action,
    entity: "Payment",
    entityId,
    metadata,
  });

/**
 * Verrouille la facture jusqu'à la fin de la transaction (l'UPDATE prend le verrou de ligne
 * PostgreSQL), puis la relit : la lecture voit alors l'état validé par les transactions
 * concurrentes. Renvoie null si la facture n'existe pas (ou pas dans cette entreprise)
 * ou n'a pas un statut parmi `allowed`.
 */
async function lockInvoice(tx: Tx, invoiceId: string, allowed: InvoiceStatus[]) {
  const locked = await tx.invoice.updateMany({
    where: { id: invoiceId, status: { in: allowed } },
    data: { updatedAt: new Date() },
  });
  if (locked.count !== 1) return null;
  return tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { total: true, status: true },
  });
}

/** Recalcule amountPaid et le statut depuis les paiements non annulés. */
async function syncInvoice(tx: Tx, invoiceId: string, total: Prisma.Decimal) {
  const agg = await tx.payment.aggregate({
    where: { invoiceId, voidedAt: null },
    _sum: { amount: true },
  });
  const paid = agg._sum.amount ?? new Prisma.Decimal(0);
  const status: InvoiceStatus = paid.isZero()
    ? "ISSUED"
    : paid.gte(total)
      ? "PAID"
      : "PARTIALLY_PAID";
  await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: paid, status } });
  return { amountPaid: paid, status, remaining: total.minus(paid) };
}

async function failBecauseNotPayable(ctx: Ctx, invoiceId: string): Promise<never> {
  const inv = await ctx.db.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  });
  if (!inv) throw new AppError("NOT_FOUND", "Facture introuvable.");
  const messages: Partial<Record<InvoiceStatus, string>> = {
    DRAFT: "Émettez la facture avant d'enregistrer un paiement.",
    CANCELLED: "Cette facture est annulée : aucun paiement possible.",
    PAID: "Cette facture est déjà entièrement payée.",
  };
  throw new AppError(
    "CONFLICT",
    messages[inv.status as InvoiceStatus] ?? "Cette facture n'accepte pas de paiement.",
  );
}

export async function recordPayment(ctx: Ctx, input: PaymentInput) {
  assertPermission(ctx, "payments:write");
  const data = paymentSchema.parse(input);
  if (data.paymentDate > todayISO()) {
    throw new AppError("VALIDATION_ERROR", "La date du paiement est dans le futur.", {
      fieldErrors: { paymentDate: ["La date du paiement ne peut pas être dans le futur."] },
    });
  }

  const result = await ctx.db.$transaction(async (tx) => {
    const invoice = await lockInvoice(tx, data.invoiceId, OPEN_STATUSES);
    if (!invoice) return null;
    const paidSoFar = await tx.payment.aggregate({
      where: { invoiceId: data.invoiceId, voidedAt: null },
      _sum: { amount: true },
    });
    const remaining = invoice.total.minus(paidSoFar._sum.amount ?? 0);
    if (new Money(data.amount).gt(remaining.toFixed(2))) {
      throw new AppError("VALIDATION_ERROR", "Le montant dépasse le reste à payer.", {
        fieldErrors: {
          amount: [`Le reste à payer est de ${remaining.toFixed(2)} DA.`],
        },
      });
    }
    const payment = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        invoiceId: data.invoiceId,
        amount: data.amount,
        paymentDate: isoToDate(data.paymentDate),
        method: data.method,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    const sync = await syncInvoice(tx, data.invoiceId, invoice.total);
    return { id: payment.id, ...sync };
  });
  if (!result) return failBecauseNotPayable(ctx, data.invoiceId);

  await audit(ctx, "payment.recorded", result.id, {
    invoiceId: data.invoiceId,
    amount: data.amount,
    method: data.method,
  });
  return {
    id: result.id,
    status: result.status,
    amountPaid: result.amountPaid.toFixed(2),
    remaining: result.remaining.toFixed(2),
  };
}

export async function voidPayment(ctx: Ctx, input: { paymentId: string; reason: string }) {
  assertPermission(ctx, "payments:write");
  const data = voidPaymentSchema.parse(input);
  const payment = await ctx.db.payment.findUnique({
    where: { id: data.paymentId },
    select: { invoiceId: true, voidedAt: true, amount: true },
  });
  if (!payment) throw new AppError("NOT_FOUND", "Paiement introuvable.");
  if (payment.voidedAt) throw new AppError("CONFLICT", "Ce paiement est déjà annulé.");

  const result = await ctx.db.$transaction(async (tx) => {
    const invoice = await lockInvoice(tx, payment.invoiceId, ["ISSUED", "PARTIALLY_PAID", "PAID"]);
    if (!invoice) throw new AppError("CONFLICT", "Cette facture n'accepte plus de modification.");
    const res = await tx.payment.updateMany({
      where: { id: data.paymentId, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: ctx.userId, voidReason: data.reason },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "Ce paiement est déjà annulé.");
    return syncInvoice(tx, payment.invoiceId, invoice.total);
  });
  await audit(ctx, "payment.voided", data.paymentId, {
    invoiceId: payment.invoiceId,
    amount: payment.amount.toFixed(2),
  });
  return {
    status: result.status,
    amountPaid: result.amountPaid.toFixed(2),
    remaining: result.remaining.toFixed(2),
  };
}

const paymentSelect = {
  id: true,
  amount: true,
  paymentDate: true,
  method: true,
  reference: true,
  notes: true,
  voidedAt: true,
  voidReason: true,
  createdAt: true,
  invoice: {
    select: { id: true, invoiceNumber: true, customer: { select: { id: true, name: true } } },
  },
} satisfies Prisma.PaymentSelect;

function toDTO(p: Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>) {
  return {
    id: p.id,
    amount: p.amount.toFixed(2),
    paymentDate: p.paymentDate,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    voided: p.voidedAt !== null,
    voidedAt: p.voidedAt,
    voidReason: p.voidReason,
    createdAt: p.createdAt,
    invoice: p.invoice,
  };
}

export async function listPayments(ctx: Ctx, params: PaymentListParams = {}) {
  assertPermission(ctx, "payments:read");
  const p = paymentListSchema.parse(params);
  const where: Prisma.PaymentWhereInput = {
    ...(p.method ? { method: p.method } : {}),
    ...(p.q
      ? {
          OR: [
            { reference: { contains: p.q, mode: "insensitive" } },
            { invoice: { invoiceNumber: { contains: p.q, mode: "insensitive" } } },
            { invoice: { customer: { name: { contains: p.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.db.payment.count({ where }),
    ctx.db.payment.findMany({
      where,
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      select: paymentSelect,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
  ]);
  return {
    items: rows.map(toDTO),
    total,
    page: p.page,
    pageSize: p.pageSize,
    pageCount: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

export async function listInvoicePayments(ctx: Ctx, invoiceId: string) {
  assertPermission(ctx, "payments:read");
  const rows = await ctx.db.payment.findMany({
    where: { invoiceId: idSchema.parse(invoiceId) },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    select: paymentSelect,
  });
  return rows.map(toDTO);
}
