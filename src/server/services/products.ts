import "server-only";
import {
  productListSchema,
  productSchema,
  type ProductData,
  type ProductInput,
  type ProductListParams,
} from "@/lib/validation/product";
import { idSchema } from "@/lib/validation/common";
import { Prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";

/**
 * Service Produits et services.
 * - Prix HT et TVA en Decimal, validés et canonisés par Zod (« 85000.00 »).
 * - La TVA doit être l'un des taux ACTIFS de l'entreprise ; seule exception : un produit
 *   peut conserver son taux actuel même si ce taux a été désactivé depuis.
 * - Un produit déjà utilisé dans un devis ou une facture ne se supprime pas, il se désactive.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

const productSelect = {
  id: true,
  type: true,
  name: true,
  sku: true,
  description: true,
  unit: true,
  priceHT: true,
  vatRate: true,
  currency: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;
export type ProductDTO = Omit<ProductRow, "priceHT" | "vatRate"> & {
  priceHT: string;
  vatRate: string;
};

const toDTO = (p: ProductRow): ProductDTO => ({
  ...p,
  priceHT: p.priceHT.toFixed(2),
  vatRate: p.vatRate.toFixed(2),
});

export async function listProducts(ctx: Ctx, params: ProductListParams = {}) {
  assertPermission(ctx, "products:read");
  const p = productListSchema.parse(params);
  const where: Prisma.ProductWhereInput = {
    active: !p.inactive,
    ...(p.type ? { type: p.type } : {}),
    ...(p.q
      ? {
          OR: (["name", "sku", "description"] as const).map((field) => ({
            [field]: { contains: p.q, mode: "insensitive" },
          })),
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.db.product.count({ where }),
    ctx.db.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: productSelect,
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

export async function getProduct(ctx: Ctx, id: string) {
  assertPermission(ctx, "products:read");
  const row = await ctx.db.product.findUnique({
    where: { id: idSchema.parse(id) },
    select: { ...productSelect, _count: { select: { invoiceItems: true, quoteItems: true } } },
  });
  if (!row) throw new AppError("NOT_FOUND", "Produit introuvable.");
  const { _count, ...product } = row;
  return { ...toDTO(product), usageCount: _count.invoiceItems + _count.quoteItems };
}

async function assertVatRateAllowed(ctx: Ctx, vatRate: string, currentRate?: string) {
  if (currentRate !== undefined && vatRate === currentRate) return;
  const exists = await ctx.db.taxRate.findFirst({
    where: { rate: vatRate, active: true },
    select: { id: true },
  });
  if (!exists) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Ce taux de TVA n'est pas configuré pour votre entreprise.",
      {
        fieldErrors: { vatRate: ["Choisissez un des taux de TVA de l'entreprise."] },
      },
    );
  }
}

function skuConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(
      "CONFLICT",
      "Cette référence (SKU) est déjà utilisée par un autre produit.",
      {
        fieldErrors: { sku: ["Référence déjà utilisée."] },
      },
    );
  }
  throw error;
}

function toDbData(data: ProductData) {
  return {
    type: data.type,
    name: data.name,
    sku: data.sku ?? null,
    description: data.description ?? null,
    unit: data.unit ?? null,
    priceHT: data.priceHT,
    vatRate: data.vatRate,
  };
}

export async function createProduct(ctx: Ctx, input: ProductInput): Promise<ProductDTO> {
  assertPermission(ctx, "products:write");
  const data = productSchema.parse(input);
  await assertVatRateAllowed(ctx, data.vatRate);
  const row = await ctx.db.product
    .create({
      data: { ...toDbData(data), organizationId: ctx.organizationId },
      select: productSelect,
    })
    .catch(skuConflict);
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "product.created",
    entity: "Product",
    entityId: row.id,
    metadata: { name: row.name, priceHT: row.priceHT.toFixed(2) },
  });
  return toDTO(row);
}

export async function updateProduct(
  ctx: Ctx,
  id: string,
  input: ProductInput,
): Promise<ProductDTO> {
  assertPermission(ctx, "products:write");
  const productId = idSchema.parse(id);
  const data = productSchema.parse(input);
  const existing = await ctx.db.product.findUnique({
    where: { id: productId },
    select: { vatRate: true, priceHT: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Produit introuvable.");
  await assertVatRateAllowed(ctx, data.vatRate, existing.vatRate.toFixed(2));

  const row = await ctx.db.product
    .update({ where: { id: productId }, data: toDbData(data), select: productSelect })
    .catch(skuConflict);
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "product.updated",
    entity: "Product",
    entityId: productId,
    metadata: {
      priceHT: { before: existing.priceHT.toFixed(2), after: row.priceHT.toFixed(2) },
      vatRate: { before: existing.vatRate.toFixed(2), after: row.vatRate.toFixed(2) },
    },
  });
  return toDTO(row);
}

export async function setProductActive(ctx: Ctx, id: string, active: boolean) {
  assertPermission(ctx, "products:write");
  const productId = idSchema.parse(id);
  const res = await ctx.db.product.updateMany({ where: { id: productId }, data: { active } });
  if (res.count !== 1) throw new AppError("NOT_FOUND", "Produit introuvable.");
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: active ? "product.reactivated" : "product.deactivated",
    entity: "Product",
    entityId: productId,
  });
}

export async function deleteProduct(ctx: Ctx, id: string) {
  assertPermission(ctx, "products:delete");
  const product = await getProduct(ctx, id);
  if (product.usageCount > 0) {
    throw new AppError(
      "CONFLICT",
      "Ce produit figure déjà sur des devis ou des factures : désactivez-le plutôt que de le supprimer.",
    );
  }
  await ctx.db.product.delete({ where: { id: product.id } }).catch((error: unknown) => {
    // Document créé entre la vérification et la suppression : la clé étrangère protège.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new AppError(
        "CONFLICT",
        "Ce produit vient d'être utilisé dans un document : désactivez-le.",
      );
    }
    throw error;
  });
  await recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: "product.deleted",
    entity: "Product",
    entityId: product.id,
    metadata: { name: product.name },
  });
}
