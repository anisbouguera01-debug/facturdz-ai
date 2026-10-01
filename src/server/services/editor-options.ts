import "server-only";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { listTaxRates } from "./tax-rates";

type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

/** Limite des listes déroulantes de l'éditeur (un sélecteur avec recherche serveur viendra au-delà). */
export const EDITOR_OPTIONS_LIMIT = 500;

/** Clients actifs, produits actifs et taux de TVA pour l'éditeur de devis/factures. */
export async function loadEditorOptions(ctx: Ctx, includeCustomerId?: string) {
  assertPermission(ctx, "customers:read");
  assertPermission(ctx, "products:read");
  const [customers, products, rates] = await Promise.all([
    ctx.db.customer.findMany({
      where: includeCustomerId
        ? { OR: [{ archivedAt: null }, { id: includeCustomerId }] }
        : { archivedAt: null },
      orderBy: { name: "asc" },
      take: EDITOR_OPTIONS_LIMIT,
      select: { id: true, name: true, wilaya: true },
    }),
    ctx.db.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: EDITOR_OPTIONS_LIMIT,
      select: { id: true, name: true, unit: true, priceHT: true, vatRate: true },
    }),
    listTaxRates(ctx),
  ]);
  return {
    customers: customers.map((c) => ({
      id: c.id,
      label: c.wilaya ? `${c.name} (${c.wilaya})` : c.name,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      priceHT: p.priceHT.toFixed(2),
      vatRate: p.vatRate.toFixed(2),
    })),
    rates,
  };
}

/** Coordonnées de l'entreprise courante (en-tête des documents). */
export async function getSellerProfile(ctx: Ctx) {
  const org = await ctx.db.organization.findFirst({
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
      logoUrl: true,
    },
  });
  if (!org) throw new Error("Organisation courante introuvable");
  return org;
}
