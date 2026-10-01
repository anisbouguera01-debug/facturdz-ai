import Decimal from "decimal.js";
import { z } from "zod";

/**
 * Calculs monétaires partagés client/serveur.
 *
 * - Jamais de `number` pour un montant : tout passe par Decimal (base 10, exacte).
 * - Arrondi « demi-supérieur » (0,005 → 0,01), le plus courant en comptabilité.
 *   Le mode d'arrondi est centralisé ici pour pouvoir être ajusté si une règle
 *   fiscale vérifiée l'exige.
 * - Le serveur reste seul juge : les aperçus calculés dans le navigateur ne sont
 *   jamais enregistrés tels quels.
 */
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Money = Decimal;

export const MAX_INT_DIGITS = 12; // DECIMAL(14,2) en base

/** Arrondi au centime. */
export function round2(value: Decimal.Value): Decimal {
  return new Money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** TVA d'un montant HT (arrondie au centime). */
export function vatAmount(ht: Decimal.Value, ratePercent: Decimal.Value): Decimal {
  return round2(new Money(ht).times(ratePercent).dividedBy(100));
}

/** Montant TTC = HT + TVA arrondie. */
export function ttcFromHt(ht: Decimal.Value, ratePercent: Decimal.Value): Decimal {
  return round2(ht).plus(vatAmount(ht, ratePercent));
}

/**
 * Normalise une saisie française : « 1 234,5 » → « 1234.5 ».
 * Les espaces (y compris insécables) et l'apostrophe servent de séparateurs de milliers.
 */
export function normalizeDecimalInput(raw: string): string {
  return raw
    .trim()
    .replace(/[\s  ']/g, "")
    .replace(",", ".");
}

/**
 * Schéma Zod d'un montant positif ou nul, au plus 2 décimales et 12 chiffres entiers.
 * Accepte une chaîne (formulaire) ou un nombre ; renvoie une chaîne canonique « 1234.50 ».
 */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((v) => normalizeDecimalInput(String(v)))
  .refine((v) => v !== "", { message: "Saisissez un montant.", abort: true })
  .refine((v) => /^\d+(\.\d+)?$/.test(v), {
    message: "Saisissez un montant valide (ex. 85000 ou 1 250,50).",
    abort: true,
  })
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), { message: "Deux décimales au maximum." })
  .refine((v) => v.split(".")[0].replace(/^0+(?=\d)/, "").length <= MAX_INT_DIGITS, {
    message: "Montant trop élevé.",
  })
  .transform((v) => new Money(v).toFixed(2));

/** Taux en pourcentage, de 0 à 100, au plus 2 décimales. Renvoie une chaîne « 19.00 ». */
export const ratePercentSchema = z
  .union([z.string(), z.number()])
  .transform((v) => normalizeDecimalInput(String(v)).replace(/%$/, ""))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
    message: "Saisissez un taux valide (ex. 19 ou 9,5), deux décimales au maximum.",
    abort: true, // ne pas évaluer la suite sur une saisie invalide
  })
  .refine((v) => new Money(v).lte(100), { message: "Le taux ne peut pas dépasser 100 %." })
  .transform((v) => new Money(v).toFixed(2));

/** « 19.00 » → « 19 », « 9.50 » → « 9,5 » (affichage d'un taux). */
export function formatRate(rate: Decimal.Value): string {
  return `${new Money(rate).toDecimalPlaces(2).toString().replace(".", ",")} %`;
}
