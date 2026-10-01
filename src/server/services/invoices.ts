import "server-only";
import { dateToISO, isoToDate, todayISO } from "@/lib/dates";
import { displayStatus, type InvoiceStatus } from "@/lib/invoice-status";
import { idSchema } from "@/lib/validation/common";
import {
  invoiceListSchema,
  invoiceSchema,
  type InvoiceInput,
  type InvoiceListParams,
} from "@/lib/validation/invoice";
import { Prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";
import { prepareLines } from "./document-lines";
import { assertWithinLimit, lockOrganization } from "./limits";
import { allocateNumber } from "./numbering";

/**
 * Service Factures.
 * - Brouillon : modifiable et supprimable. Aucun numéro.
 * - Émission : numéro continu attribué dans la transaction, vendeur et client figés
 *   (snapshots), facture verrouillée. Une facture émise ne se modifie ni ne se supprime.
 * - Annulation : seulement une facture émise sans aucun paiement ; le numéro reste occupé.
 * - Montants : toujours recalculés ici (prepareLines) ; ceux du client sont ignorés.
 * - amountPaid et les statuts PARTIALLY_PAID / PAID sont posés par le module Paiements.
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
    entity: "Invoice",
    entityId,
    metadata,
  });

const NOT_DRAFT = "Seule une facture en brouillon peut être modifiée.";

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

export async function createInvoice(ctx: Ctx, input: InvoiceInput) {
  assertPermission(ctx, "invoices:create");
  const data = invoiceSchema.parse(input);
  await assertCustomerUsable(ctx, data.customerId);
  const { rows, totals } = await prepareLines(ctx.db, data.items);

  const invoice = await ctx.db.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: data.customerId,
        issueDate: isoToDate(data.issueDate),
        dueDate: data.dueDate ? isoToDate(data.dueDate) : null,
        notes: data.notes ?? null,
        paymentTerms: data.terms ?? null,
        createdById: ctx.userId,
        ...totals,
      },
      select: { id: true },
    });
    await tx.invoiceItem.createMany({
      data: rows.map((r) => ({ ...r, invoiceId: inv.id, organizationId: ctx.organizationId })),
    });
    return inv;
  });
  await audit(ctx, "invoice.created", invoice.id, { total: totals.total });
  return { id: invoice.id, ...totals };
}

export async function updateInvoice(ctx: Ctx, id: string, input: InvoiceInput) {
  assertPermission(ctx, "invoices:update");
  const invoiceId = idSchema.parse(id);
  const data = invoiceSchema.parse(input);
  const existing = await ctx.db.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, customerId: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Facture introuvable.");
  if (existing.status !== "DRAFT") throw new AppError("CONFLICT", NOT_DRAFT);
  await assertCustomerUsable(ctx, data.customerId, existing.customerId);
  const { rows, totals } = await prepareLines(ctx.db, data.items);

  await ctx.db.$transaction(async (tx) => {
    // Condition sur le statut : protège d'une émission simultanée entre lecture et écriture.
    const res = await tx.invoice.updateMany({
      where: { id: invoiceId, status: "DRAFT" },
      data: {
        customerId: data.customerId,
        issueDate: isoToDate(data.issueDate),
        dueDate: data.dueDate ? isoToDate(data.dueDate) : null,
        notes: data.notes ?? null,
        paymentTerms: data.terms ?? null,
        ...totals,
      },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", NOT_DRAFT);
    await tx.invoiceItem.deleteMany({ where: { invoiceId } });
    await tx.invoiceItem.createMany({
      data: rows.map((r) => ({ ...r, invoiceId, organizationId: ctx.organizationId })),
    });
  });
  await audit(ctx, "invoice.updated", invoiceId, { total: totals.total });
  return { id: invoiceId, ...totals };
}

/** Émission : numéro continu + figement du vendeur et du client. */
export async function issueInvoice(ctx: Ctx, id: string) {
  assertPermission(ctx, "invoices:issue");
  const invoiceId = idSchema.parse(id);
  const number = await ctx.db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        issueDate: true,
        total: true,
        customer: {
          select: {
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
          },
        },
        _count: { select: { items: true } },
      },
    });
    if (!invoice) throw new AppError("NOT_FOUND", "Facture introuvable.");
    if (invoice.status !== "DRAFT")
      throw new AppError("CONFLICT", "Cette facture a déjà été émise.");
    if (invoice._count.items === 0)
      throw new AppError("VALIDATION_ERROR", "Une facture sans ligne ne peut pas être émise.");

    const seller = await tx.organization.findFirst({
      select: {
        name: true,
        legalName: true,
        address: true,
        wilaya: true,
        commune: true,
        phone: true,
        email: true,
        nif: true,
        nis: true,
        rc: true,
        articleImposition: true,
      },
    });
    if (!seller) throw new AppError("NOT_FOUND", "Entreprise introuvable.");

    // Limite du plan : verrou sur l'entreprise puis comptage, dans la même transaction.
    await lockOrganization(tx, ctx.organizationId);
    await assertWithinLimit(tx, "INVOICES_PER_MONTH");

    const n = await allocateNumber(tx, ctx.organizationId, "INVOICE", dateToISO(invoice.issueDate));
    const res = await tx.invoice.updateMany({
      where: { id: invoiceId, status: "DRAFT" },
      data: {
        status: "ISSUED",
        invoiceNumber: n,
        issuedAt: new Date(),
        sellerSnapshot: seller,
        customerSnapshot: invoice.customer,
      },
    });
    if (res.count !== 1) throw new AppError("CONFLICT", "Cette facture a déjà été émise.");
    return n;
  });
  await audit(ctx, "invoice.issued", invoiceId, { number });
  return { number };
}

/**
 * Annulation : facture émise et non encaissée. La facture et son numéro sont conservés
 * (continuité de la numérotation). Une facture déjà encaissée relève d'un avoir (non géré).
 */
export async function cancelInvoice(ctx: Ctx, id: string) {
  assertPermission(ctx, "invoices:cancel");
  const invoiceId = idSchema.parse(id);
  const res = await ctx.db.invoice.updateMany({
    where: { id: invoiceId, status: "ISSUED", amountPaid: new Prisma.Decimal(0) },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (res.count !== 1) {
    const inv = await ctx.db.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    if (!inv) throw new AppError("NOT_FOUND", "Facture introuvable.");
    if (inv.status === "DRAFT")
      throw new AppError("CONFLICT", "Un brouillon se supprime, il ne s'annule pas.");
    if (inv.status === "CANCELLED")
      throw new AppError("CONFLICT", "Cette facture est déjà annulée.");
    throw new AppError("CONFLICT", "Une facture qui a reçu un paiement ne peut pas être annulée.");
  }
  await audit(ctx, "invoice.cancelled", invoiceId);
}

export async function deleteInvoice(ctx: Ctx, id: string) {
  assertPermission(ctx, "invoices:delete");
  const invoiceId = idSchema.parse(id);
  const res = await ctx.db.invoice.deleteMany({ where: { id: invoiceId, status: "DRAFT" } });
  if (res.count !== 1) {
    const exists = await ctx.db.invoice.count({ where: { id: invoiceId } });
    if (!exists) throw new AppError("NOT_FOUND", "Facture introuvable.");
    throw new AppError(
      "CONFLICT",
      "Seul un brouillon peut être supprimé ; une facture émise s'annule.",
    );
  }
  await audit(ctx, "invoice.deleted", invoiceId);
}

/**
 * Conversion d'un devis ACCEPTÉ en facture brouillon. Les lignes et totaux du devis
 * (déjà calculés et figés côté serveur) sont copiés tels quels ; le devis passe à
 * « facturé » dans la même transaction. Une seule facture par devis (contrainte unique).
 */
export async function createInvoiceFromQuote(ctx: Ctx, quoteId: string) {
  assertPermission(ctx, "invoices:create");
  assertPermission(ctx, "quotes:read");
  const id = idSchema.parse(quoteId);

  const invoice = await ctx.db.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!quote) throw new AppError("NOT_FOUND", "Devis introuvable.");
    if (quote.status !== "ACCEPTED") {
      throw new AppError(
        "CONFLICT",
        quote.status === "CONVERTED"
          ? "Ce devis a déjà été converti en facture."
          : "Seul un devis accepté peut être converti en facture.",
      );
    }
    const claimed = await tx.quote.updateMany({
      where: { id, status: "ACCEPTED" },
      data: { status: "CONVERTED" },
    });
    if (claimed.count !== 1)
      throw new AppError("CONFLICT", "Ce devis a déjà été converti en facture.");

    const today = todayISO();
    const inv = await tx.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: quote.customerId,
        quoteId: quote.id,
        issueDate: isoToDate(today),
        notes: quote.notes,
        paymentTerms: quote.terms,
        createdById: ctx.userId,
        currency: quote.currency,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        taxTotal: quote.taxTotal,
        total: quote.total,
      },
      select: { id: true, total: true },
    });
    await tx.invoiceItem.createMany({
      data: quote.items.map((it) => ({
        organizationId: ctx.organizationId,
        invoiceId: inv.id,
        position: it.position,
        productId: it.productId,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountRate: it.discountRate,
        vatRate: it.vatRate,
        subtotal: it.subtotal,
        taxAmount: it.taxAmount,
        total: it.total,
      })),
    });
    return inv;
  });
  await audit(ctx, "invoice.created_from_quote", invoice.id, { quoteId: id });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "quote.converted",
    entity: "Quote",
    entityId: id,
    metadata: { invoiceId: invoice.id },
  });
  return { id: invoice.id, total: invoice.total.toFixed(2) };
}

const listSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  total: true,
  amountPaid: true,
  customer: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceSelect;

export async function listInvoices(ctx: Ctx, params: InvoiceListParams = {}) {
  assertPermission(ctx, "invoices:read");
  const p = invoiceListSchema.parse(params);
  const today = isoToDate(todayISO());
  const open = { in: ["ISSUED", "PARTIALLY_PAID"] as InvoiceStatus[] };
  const statusWhere: Prisma.InvoiceWhereInput =
    p.status === "OVERDUE"
      ? { status: open, dueDate: { lt: today } }
      : p.status === "ISSUED" || p.status === "PARTIALLY_PAID"
        ? {
            status: p.status,
            OR: [{ dueDate: null }, { dueDate: { gte: today } }],
          }
        : p.status
          ? { status: p.status }
          : {};
  const where: Prisma.InvoiceWhereInput = {
    ...statusWhere,
    ...(p.customerId ? { customerId: p.customerId } : {}),
    ...(p.q
      ? {
          AND: [
            {
              OR: [
                { invoiceNumber: { contains: p.q, mode: "insensitive" } },
                { customer: { name: { contains: p.q, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.db.invoice.count({ where }),
    ctx.db.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      select: listSelect,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      status: r.status as InvoiceStatus,
      displayStatus: displayStatus(r.status as InvoiceStatus, r.dueDate),
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      customer: r.customer,
      total: r.total.toFixed(2),
      amountPaid: r.amountPaid.toFixed(2),
      remaining: r.total.minus(r.amountPaid).toFixed(2),
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
    pageCount: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

type Party = {
  name: string;
  legalName?: string | null;
  companyName?: string | null;
  address?: string | null;
  commune?: string | null;
  wilaya?: string | null;
  phone?: string | null;
  email?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  articleImposition?: string | null;
};

export async function getInvoice(ctx: Ctx, id: string) {
  assertPermission(ctx, "invoices:read");
  const inv = await ctx.db.invoice.findUnique({
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
      quote: { select: { id: true, number: true } },
    },
  });
  if (!inv) throw new AppError("NOT_FOUND", "Facture introuvable.");
  const status = inv.status as InvoiceStatus;
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status,
    displayStatus: displayStatus(status, inv.dueDate),
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    issuedAt: inv.issuedAt,
    cancelledAt: inv.cancelledAt,
    currency: inv.currency,
    notes: inv.notes,
    paymentTerms: inv.paymentTerms,
    subtotal: inv.subtotal.toFixed(2),
    discountTotal: inv.discountTotal.toFixed(2),
    taxTotal: inv.taxTotal.toFixed(2),
    total: inv.total.toFixed(2),
    amountPaid: inv.amountPaid.toFixed(2),
    remaining: inv.total.minus(inv.amountPaid).toFixed(2),
    // Facture émise : coordonnées figées à l'émission ; brouillon : coordonnées actuelles.
    customer: inv.customer,
    customerParty: (inv.customerSnapshot as Party | null) ?? inv.customer,
    sellerSnapshot: inv.sellerSnapshot as Party | null,
    quote: inv.quote,
    createdAt: inv.createdAt,
    items: inv.items.map((it) => ({
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

export type InvoiceDetail = Awaited<ReturnType<typeof getInvoice>>;
