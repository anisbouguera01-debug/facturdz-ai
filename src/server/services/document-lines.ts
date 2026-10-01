import "server-only";
import { computeDocument, MAX_STORED_AMOUNT, toStoredTotals, type LineData } from "@/lib/billing";
import type { TenantDb } from "@/server/db/tenant";
import { AppError } from "@/server/errors";

/**
 * Validation métier et calcul des lignes d'un document (devis ou facture).
 *
 * - Chaque produit référencé doit exister dans l'entreprise (client tenant).
 * - Taux de TVA autorisés : taux ACTIFS de l'entreprise, plus le taux propre d'un produit
 *   référencé par la ligne (un produit peut garder un taux désactivé depuis).
 * - Montants recalculés ici à partir des seules quantités, prix, remises et taux.
 */
type Reader = Pick<TenantDb, "product" | "taxRate">;

export interface PreparedLines {
  rows: {
    position: number;
    productId: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    discountRate: string;
    vatRate: string;
    subtotal: string;
    taxAmount: string;
    total: string;
  }[];
  totals: ReturnType<typeof toStoredTotals>;
}

export async function prepareLines(db: Reader, lines: LineData[]): Promise<PreparedLines> {
  const productIds = [
    ...new Set(lines.map((l) => l.productId).filter((v): v is string => Boolean(v))),
  ];
  const [products, rates] = await Promise.all([
    productIds.length
      ? db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, vatRate: true },
        })
      : Promise.resolve([]),
    db.taxRate.findMany({ where: { active: true }, select: { rate: true } }),
  ]);
  const productRate = new Map(products.map((p) => [p.id, p.vatRate.toFixed(2)]));
  const activeRates = new Set(rates.map((r) => r.rate.toFixed(2)));

  const fieldErrors: Record<string, string[]> = {};
  lines.forEach((l, i) => {
    if (l.productId && !productRate.has(l.productId)) {
      fieldErrors[`items.${i}.productId`] = ["Produit introuvable."];
    }
    const allowed =
      activeRates.has(l.vatRate) || (l.productId && productRate.get(l.productId) === l.vatRate);
    if (!allowed)
      fieldErrors[`items.${i}.vatRate`] = ["Taux de TVA non configuré pour l'entreprise."];
  });
  if (Object.keys(fieldErrors).length) {
    throw new AppError("VALIDATION_ERROR", "Certaines lignes sont invalides.", { fieldErrors });
  }

  const computed = computeDocument(lines);
  if (computed.grossTotal.gt(MAX_STORED_AMOUNT) || computed.total.gt(MAX_STORED_AMOUNT)) {
    throw new AppError("VALIDATION_ERROR", "Le montant total dépasse la limite autorisée.");
  }

  return {
    rows: lines.map((l, i) => ({
      position: i + 1,
      productId: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountRate: l.discountRate,
      vatRate: l.vatRate,
      subtotal: computed.lines[i].subtotal.toFixed(2),
      taxAmount: computed.lines[i].taxAmount.toFixed(2),
      total: computed.lines[i].total.toFixed(2),
    })),
    totals: toStoredTotals(computed),
  };
}
