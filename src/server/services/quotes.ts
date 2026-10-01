import "server-only";
import { addDays, dateToISO, isoToDate, todayISO } from "@/lib/dates";
import { canTransition, quoteDisplayStatus, type QuoteStatus } from "@/lib/quote-status";
import { idSchema } from "@/lib/validation/common";
import {
  quoteListSchema,
  quoteSchema,
  type QuoteInput,
  type QuoteListParams,
} from "@/lib/validation/quote";
import { Prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";
import { prepareLines } from "./document-lines";
import { assertWithinLimit, lockOrganization } from "./limits";
import { allocateNumber } from "./numbering";

/**
 * Service Devis.
 * - Seuls les brouillons sont modifiables ou supprimables.
 * - Le numéro est attribué à l'envoi (DRAFT → SENT), dans la même transaction.
 * - Tous les montants sont recalculés côté serveur (prepareLines).
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

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
    entity: "Quote",
    entityId,
    metadata,
  });

async function assertCustomerUsable(ctx: Ctx, customerId: string, currentCustomerId?: string) {
  const customer = await ctx.db.customer.findUnique({
    where: { id: customerId },
    select: { archivedAt: true },
  });
  if (!customer) {
    throw new AppError("VALIDATION_ERROR", "Client introuvable.", {
      fieldErrors: { customerId: ["Client introuvable."] },
    });
  }
  if (customer.archivedAt && customerId !== currentCustomerId) {
    throw new AppError("VALIDATION_ERROR", "Ce client est archivé.", {
      fieldErrors: { customerId: ["Client archivé : restaurez-le ou choisissez-en un autre."] },
    });
  }
}

export async function createQuote(ctx: Ctx, input: QuoteInput) {
  assertPermission(ctx, "quotes:write");
  const data = quoteSchema.parse(input);
  await assertCustomerUsable(ctx, data.customerId);
  const { rows, totals } = await prepareLines(ctx.db, data.items);

  const quote = await ctx.db.$transaction(async (tx) => {
    // Limite du plan : verrou sur l'entreprise puis comptage, dans la même transaction.
    await lockOrganization(tx, ctx.organizationId);
    await assertWithinLimit(tx, "QUOTES_PER_MONTH");
    const q = await tx.quote.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: data.customerId,
        issueDate: isoToDate(data.issueDate),
        expiryDate: data.expiryDate ? isoToDate(data.expiryDate) : null,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        createdById: ctx.userId,
        ...totals,
      },
      select: { id: true },
    });
    await tx.quoteItem.createMany({
      data: rows.map((r) => ({ ...r, quoteId: q.id, organizationId: ctx.organizationId })),
    });
    return q;
  });
  await audit(ctx, "quote.created", quote.id, { total: totals.total });
  return { id: quote.id, ...totals };
}

export async function updateQuote(ctx: Ctx, id: string, input: QuoteInput) {
  assertPermission(ctx, "quotes:write");
  const quoteId = idSchema.parse(id);
  const data = quoteSchema.parse(input);
  const existing = await ctx.db.quote.findUnique({
    where: { id: quoteId },
    select: { status: true, customerId: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Devis introuvable.");
  if (existing.status !== "DRAFT")
    throw new AppError("CONFLICT", "Seul un devis en brouillon peut être modifié.");
  await assertCustomerUsable(ctx, data.customerId, existing.customerId);
  const { rows, totals } = await prepareLines(ctx.db, data.items);

  await ctx.db.$transaction(async (tx) => {
    // Condition sur le statut : protège d'un envoi simultané entre la lecture et l'écriture.
    const res = await tx.quote.updateMany({
      where: { id: quoteId, status: "DRAFT" },
      data: {
        customerId: data.customerId,
        issueDate: isoToDate(data.issueDate),
        expiryDate: data.expiryDate ? isoToDate(data.expiryDate) : null,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        ...totals,
      },
    });
    if (res.count !== 1)
      throw new AppError("CONFLICT", "Seul un devis en brouillon peut être modifié.");
    await tx.quoteItem.deleteMany({ where: { quoteId } });
    await tx.quoteItem.createMany({
      data: rows.map((r) => ({ ...r, quoteId, organizationId: ctx.organizationId })),
    });
  });
  await audit(ctx, "quote.updated", quoteId, { total: totals.total });
  return { id: quoteId, ...totals };
}

/** Envoi : attribue le numéro et fige le devis. */
export async function sendQuote(ctx: Ctx, id: string) {
  assertPermission(ctx, "quotes:write");
  const quoteId = idSchema.parse(id);
  const number = await ctx.db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      select: { status: true, issueDate: true },
    });
    if (!quote) throw new AppError("NOT_FOUND", "Devis introuvable.");
    if (!canTransition(quote.status, "SENT"))
      throw new AppError("CONFLICT", "Ce devis a déjà été envoyé.");
    const n = await allocateNumber(tx, ctx.organizationId, "QUOTE", dateToISO(quote.issueDate));
    const res = await tx.quote.updateMany({
      where: { id: quoteId, status: "DRAFT" },
      data: { status: "SENT", number: n },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "Ce devis a déjà été envoyé.");
    return n;
  });
  await audit(ctx, "quote.sent", quoteId, { number });
  return { number };
}

/** Réponse du client : accepté ou refusé (uniquement depuis « envoyé »). */
export async function respondToQuote(ctx: Ctx, id: string, status: "ACCEPTED" | "REJECTED") {
  assertPermission(ctx, "quotes:write");
  const quoteId = idSchema.parse(id);
  if (status !== "ACCEPTED" && status !== "REJECTED") throw new AppError("VALIDATION_ERROR");
  const quote = await ctx.db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  if (!quote) throw new AppError("NOT_FOUND", "Devis introuvable.");
  if (!canTransition(quote.status, status)) {
    throw new AppError("CONFLICT", "Seul un devis envoyé peut être accepté ou refusé.");
  }
  const res = await ctx.db.quote.updateMany({
    where: { id: quoteId, status: quote.status },
    data: { status },
  });
  if (res.count !== 1)
    throw new AppError("CONFLICT", "Le devis a changé entre-temps. Rechargez la page.");
  await audit(ctx, status === "ACCEPTED" ? "quote.accepted" : "quote.rejected", quoteId);
}

/** Copie en nouveau brouillon daté d'aujourd'hui (même durée de validité). */
export async function duplicateQuote(ctx: Ctx, id: string) {
  assertPermission(ctx, "quotes:write");
  const source = await getQuote(ctx, id);
  const today = todayISO();
  const validity =
    source.expiryDate !== null
      ? Math.round((source.expiryDate.getTime() - source.issueDate.getTime()) / 86_400_000)
      : null;
  const copy = await createQuote(ctx, {
    customerId: source.customer.id,
    issueDate: today,
    expiryDate: validity !== null ? addDays(today, validity) : undefined,
    notes: source.notes ?? undefined,
    terms: source.terms ?? undefined,
    items: source.items.map((it) => ({
      productId: it.productId ?? undefined,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountRate: it.discountRate,
      vatRate: it.vatRate,
    })),
  });
  await audit(ctx, "quote.duplicated", copy.id, { from: source.id });
  return copy;
}

export async function deleteQuote(ctx: Ctx, id: string) {
  assertPermission(ctx, "quotes:delete");
  const quoteId = idSchema.parse(id);
  const res = await ctx.db.quote.deleteMany({ where: { id: quoteId, status: "DRAFT" } });
  if (res.count !== 1) {
    const exists = await ctx.db.quote.count({ where: { id: quoteId } });
    if (!exists) throw new AppError("NOT_FOUND", "Devis introuvable.");
    throw new AppError("CONFLICT", "Seul un devis en brouillon peut être supprimé.");
  }
  await audit(ctx, "quote.deleted", quoteId);
}

const listSelect = {
  id: true,
  number: true,
  status: true,
  issueDate: true,
  expiryDate: true,
  total: true,
  customer: { select: { id: true, name: true } },
} satisfies Prisma.QuoteSelect;

export async function listQuotes(ctx: Ctx, params: QuoteListParams = {}) {
  assertPermission(ctx, "quotes:read");
  const p = quoteListSchema.parse(params);
  const today = isoToDate(todayISO());
  const statusWhere: Prisma.QuoteWhereInput =
    p.status === "EXPIRED"
      ? { status: "SENT", expiryDate: { lt: today } }
      : p.status === "SENT"
        ? { status: "SENT", OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] }
        : p.status
          ? { status: p.status }
          : {};
  const where: Prisma.QuoteWhereInput = {
    ...statusWhere,
    ...(p.customerId ? { customerId: p.customerId } : {}),
    ...(p.q
      ? {
          AND: [
            {
              OR: [
                { number: { contains: p.q, mode: "insensitive" } },
                { customer: { name: { contains: p.q, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.db.quote.count({ where }),
    ctx.db.quote.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      select: listSelect,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
  ]);
  return {
    items: rows.map((r) => ({
      ...r,
      total: r.total.toFixed(2),
      displayStatus: quoteDisplayStatus(r.status, r.expiryDate),
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
    pageCount: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

export async function getQuote(ctx: Ctx, id: string) {
  assertPermission(ctx, "quotes:read");
  const q = await ctx.db.quote.findUnique({
    where: { id: idSchema.parse(id) },
    include: {
      items: { orderBy: { position: "asc" } },
      customer: {
        select: {
          id: true,
          name: true,
          companyName: true,
          email: true,
          phone: true,
          address: true,
          wilaya: true,
          commune: true,
          nif: true,
          nis: true,
          rc: true,
          articleImposition: true,
          archivedAt: true,
        },
      },
      invoice: { select: { id: true, invoiceNumber: true } },
    },
  });
  if (!q) throw new AppError("NOT_FOUND", "Devis introuvable.");
  const status = q.status as QuoteStatus;
  return {
    id: q.id,
    number: q.number,
    status,
    displayStatus: quoteDisplayStatus(status, q.expiryDate),
    issueDate: q.issueDate,
    expiryDate: q.expiryDate,
    currency: q.currency,
    notes: q.notes,
    terms: q.terms,
    subtotal: q.subtotal.toFixed(2),
    discountTotal: q.discountTotal.toFixed(2),
    taxTotal: q.taxTotal.toFixed(2),
    total: q.total.toFixed(2),
    customer: q.customer,
    invoice: q.invoice,
    createdAt: q.createdAt,
    items: q.items.map((it) => ({
      id: it.id,
      position: it.position,
      productId: it.productId,
      description: it.description,
      quantity: it.quantity.toFixed(3),
      unitPrice: it.unitPrice.toFixed(2),
      discountRate: it.discountRate.toFixed(2),
      vatRate: it.vatRate.toFixed(2),
      subtotal: it.subtotal.toFixed(2),
      taxAmount: it.taxAmount.toFixed(2),
      total: it.total.toFixed(2),
    })),
  };
}

export type QuoteDetail = Awaited<ReturnType<typeof getQuote>>;
