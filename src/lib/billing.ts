import Decimal from "decimal.js";
import { z } from "zod";
import { Money, moneySchema, normalizeDecimalInput, ratePercentSchema, round2 } from "./money";

/**
 * Moteur de calcul des devis et factures — module PUR partagé navigateur/serveur.
 *
 * Par ligne :
 *   brut      = arrondi(quantité × prix unitaire HT)
 *   remise    = arrondi(brut × taux de remise / 100)
 *   HT net    = brut − remise                       → `subtotal` de la ligne
 *   TVA       = arrondi(HT net × taux de TVA / 100) → `taxAmount`
 *   TTC       = HT net + TVA                         → `total`
 * Document : sommes des lignes (le total est donc toujours égal à la somme des lignes).
 *
 * Arrondi au centime, demi-supérieur, à chaque étape de ligne. Cette convention
 * (TVA arrondie par ligne) est centralisée ici : si un comptable impose un calcul de
 * TVA par taux, c'est le seul endroit à modifier. La ventilation par taux est fournie
 * pour l'affichage et le PDF.
 *
 * Le serveur recalcule TOUJOURS à partir des quantités, prix, remises et taux : les
 * montants éventuellement envoyés par le navigateur sont ignorés.
 */

export const MAX_LINES = 200;

/** Quantité > 0, au plus 3 décimales et 9 chiffres entiers. Renvoie « 10.000 ». */
export const quantitySchema = z
  .union([z.string(), z.number()])
  .transform((v) => normalizeDecimalInput(String(v)))
  .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), {
    message: "Quantité invalide (3 décimales au maximum).",
    abort: true,
  })
  .refine((v) => new Money(v).gt(0), { message: "La quantité doit être supérieure à 0." })
  .refine((v) => v.split(".")[0].replace(/^0+(?=\d)/, "").length <= 9, {
    message: "Quantité trop élevée.",
  })
  .transform((v) => new Money(v).toFixed(3));

export const lineInputSchema = z.object({
  productId: z
    .string()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
  description: z
    .string()
    .trim()
    .min(1, "Saisissez une désignation.")
    .max(500, "500 caractères maximum."),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  discountRate: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || String(v).trim() === "" ? "0" : v))
    .pipe(ratePercentSchema),
  vatRate: ratePercentSchema,
});

export type LineInput = z.input<typeof lineInputSchema>;
export type LineData = z.output<typeof lineInputSchema>;

export interface LineTotals {
  gross: Decimal;
  discount: Decimal;
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

export function computeLine(
  line: Pick<LineData, "quantity" | "unitPrice" | "discountRate" | "vatRate">,
): LineTotals {
  const gross = round2(new Money(line.quantity).times(line.unitPrice));
  const discount = round2(gross.times(line.discountRate).dividedBy(100));
  const subtotal = gross.minus(discount);
  const taxAmount = round2(subtotal.times(line.vatRate).dividedBy(100));
  return { gross, discount, subtotal, taxAmount, total: subtotal.plus(taxAmount) };
}

export interface DocumentTotals {
  lines: LineTotals[];
  /** HT avant remises. */
  grossTotal: Decimal;
  discountTotal: Decimal;
  /** HT net (après remises). */
  subtotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
  /** Ventilation de la TVA par taux, trié par taux décroissant. */
  vatBreakdown: { rate: string; base: Decimal; tax: Decimal }[];
}

export function computeDocument(
  lines: Pick<LineData, "quantity" | "unitPrice" | "discountRate" | "vatRate">[],
): DocumentTotals {
  const computed = lines.map(computeLine);
  const zero = new Money(0);
  const sum = (pick: (l: LineTotals) => Decimal) =>
    computed.reduce((acc, l) => acc.plus(pick(l)), zero);

  const byRate = new Map<string, { base: Decimal; tax: Decimal }>();
  lines.forEach((l, i) => {
    const key = new Money(l.vatRate).toFixed(2);
    const cur = byRate.get(key) ?? { base: zero, tax: zero };
    byRate.set(key, {
      base: cur.base.plus(computed[i].subtotal),
      tax: cur.tax.plus(computed[i].taxAmount),
    });
  });

  return {
    lines: computed,
    grossTotal: sum((l) => l.gross),
    discountTotal: sum((l) => l.discount),
    subtotal: sum((l) => l.subtotal),
    taxTotal: sum((l) => l.taxAmount),
    total: sum((l) => l.total),
    vatBreakdown: [...byRate.entries()]
      .map(([rate, v]) => ({ rate, ...v }))
      .sort((a, b) => new Money(b.rate).comparedTo(a.rate)),
  };
}

/** Totaux en chaînes canoniques, prêts à être stockés en Decimal(14,2). */
export function toStoredTotals(t: DocumentTotals) {
  return {
    subtotal: t.subtotal.toFixed(2),
    discountTotal: t.discountTotal.toFixed(2),
    taxTotal: t.taxTotal.toFixed(2),
    total: t.total.toFixed(2),
  };
}

/** Plafond DECIMAL(14,2) : 12 chiffres entiers. */
export const MAX_STORED_AMOUNT = new Money("999999999999.99");
