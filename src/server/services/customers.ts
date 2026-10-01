import "server-only";
import {
  customerListSchema,
  customerSchema,
  type CustomerInput,
  type CustomerListParams,
} from "@/lib/validation/customer";
import { idSchema } from "@/lib/validation/common";
import { Prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";

/**
 * Service Clients.
 *
 * Chaque fonction reçoit le contexte tenant et vérifie elle-même la permission :
 * la règle tient même si une action oublie de la vérifier. Toutes les requêtes
 * passent par `ctx.db`, limité à l'organisation courante.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

const customerSelect = {
  id: true,
  type: true,
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
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

export type CustomerDTO = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;

export interface CustomerStats {
  invoiceCount: number;
  totalInvoiced: string;
  totalPaid: string;
  totalUnpaid: string;
}

export interface CustomerListResult {
  items: CustomerDTO[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listCustomers(
  ctx: Ctx,
  params: CustomerListParams = {},
): Promise<CustomerListResult> {
  assertPermission(ctx, "customers:read");
  const p = customerListSchema.parse(params);

  const where: Prisma.CustomerWhereInput = {
    archivedAt: p.archived ? { not: null } : null,
    ...(p.type ? { type: p.type } : {}),
    ...(p.q
      ? {
          OR: (["name", "companyName", "email", "phone", "nif", "wilaya", "commune"] as const).map(
            (field) => ({ [field]: { contains: p.q, mode: "insensitive" } }),
          ),
        }
      : {}),
  };
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
    p.sort === "name"
      ? [{ name: "asc" }, { id: "asc" }]
      : [{ createdAt: p.sort === "createdAt" ? "asc" : "desc" }, { id: "asc" }];

  const [total, items] = await Promise.all([
    ctx.db.customer.count({ where }),
    ctx.db.customer.findMany({
      where,
      orderBy,
      select: customerSelect,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
  ]);
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    pageCount: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/** Fiche client. NOT_FOUND aussi pour un client d'une autre organisation (rien n'est révélé). */
export async function getCustomer(ctx: Ctx, id: string): Promise<CustomerDTO> {
  assertPermission(ctx, "customers:read");
  const customer = await ctx.db.customer.findUnique({
    where: { id: idSchema.parse(id) },
    select: customerSelect,
  });
  if (!customer) throw new AppError("NOT_FOUND", "Client introuvable.");
  return customer;
}

/**
 * Chiffres du client, calculés en base. Les brouillons et factures annulées ne comptent pas.
 * Montants renvoyés en chaînes décimales exactes (jamais de float).
 */
export async function getCustomerStats(ctx: Ctx, id: string): Promise<CustomerStats> {
  assertPermission(ctx, "customers:read");
  const agg = await ctx.db.invoice.aggregate({
    where: { customerId: idSchema.parse(id), status: { notIn: ["DRAFT", "CANCELLED"] } },
    _count: { _all: true },
    _sum: { total: true, amountPaid: true },
  });
  const invoiced = agg._sum.total ?? new Prisma.Decimal(0);
  const paid = agg._sum.amountPaid ?? new Prisma.Decimal(0);
  return {
    invoiceCount: agg._count._all,
    totalInvoiced: invoiced.toFixed(2),
    totalPaid: paid.toFixed(2),
    totalUnpaid: invoiced.minus(paid).toFixed(2),
  };
}

export async function createCustomer(ctx: Ctx, input: CustomerInput): Promise<CustomerDTO> {
  assertPermission(ctx, "customers:write");
  const data = customerSchema.parse(input);
  const customer = await ctx.db.customer.create({
    data: { ...data, organizationId: ctx.organizationId },
    select: customerSelect,
  });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "customer.created",
    entity: "Customer",
    entityId: customer.id,
    metadata: { name: customer.name },
  });
  return customer;
}

export async function updateCustomer(
  ctx: Ctx,
  id: string,
  input: CustomerInput,
): Promise<CustomerDTO> {
  assertPermission(ctx, "customers:write");
  const data = customerSchema.parse(input);
  const customerId = idSchema.parse(id);
  const existing = await ctx.db.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Client introuvable.");

  // Les champs facultatifs vidés doivent être effacés en base (undefined → null).
  const nullable = Object.fromEntries(
    Object.keys(customerSchema.shape).map((k) => [k, (data as Record<string, unknown>)[k] ?? null]),
  ) as Prisma.CustomerUpdateInput;

  const customer = await ctx.db.customer.update({
    where: { id: customerId },
    data: { ...nullable, type: data.type, name: data.name },
    select: customerSelect,
  });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "customer.updated",
    entity: "Customer",
    entityId: customer.id,
  });
  return customer;
}

/** Archive (ou restaure) : le client disparaît des listes et des choix, ses documents restent. */
export async function setCustomerArchived(ctx: Ctx, id: string, archived: boolean) {
  assertPermission(ctx, "customers:write");
  const customerId = idSchema.parse(id);
  const res = await ctx.db.customer.updateMany({
    where: { id: customerId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (res.count !== 1) throw new AppError("NOT_FOUND", "Client introuvable.");
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: archived ? "customer.archived" : "customer.restored",
    entity: "Customer",
    entityId: customerId,
  });
}

/** Suppression définitive : seulement si le client n'a aucun devis ni aucune facture. */
export async function deleteCustomer(ctx: Ctx, id: string) {
  assertPermission(ctx, "customers:delete");
  const customerId = idSchema.parse(id);
  const customer = await ctx.db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, _count: { select: { invoices: true, quotes: true } } },
  });
  if (!customer) throw new AppError("NOT_FOUND", "Client introuvable.");
  if (customer._count.invoices > 0 || customer._count.quotes > 0) {
    throw new AppError(
      "CONFLICT",
      "Ce client a des devis ou des factures : archivez-le plutôt que de le supprimer.",
    );
  }
  await ctx.db.customer.delete({ where: { id: customerId } });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "customer.deleted",
    entity: "Customer",
    entityId: customerId,
    metadata: { name: customer.name },
  });
}

/** Dernières factures du client (historique de la fiche). */
export async function listCustomerInvoices(ctx: Ctx, id: string, take = 10) {
  assertPermission(ctx, "invoices:read");
  return ctx.db.invoice.findMany({
    where: { customerId: idSchema.parse(id) },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      issueDate: true,
      dueDate: true,
      total: true,
      amountPaid: true,
    },
  });
}
