import { z } from "zod";

/**
 * Dates « calendaires » (date d'émission, échéance, validité) : chaînes AAAA-MM-JJ,
 * stockées en colonne DATE (minuit UTC). La date du jour est celle de l'Algérie.
 */
export const BUSINESS_TIME_ZONE = "Africa/Algiers";

/** Date du jour au format AAAA-MM-JJ dans le fuseau de l'entreprise. */
export function todayISO(now: Date = new Date(), timeZone = BUSINESS_TIME_ZONE): string {
  // en-CA formate en AAAA-MM-JJ
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateToISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToISO(d);
}

/** Date AAAA-MM-JJ valide (refuse 2026-02-30). */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
  .refine((v) => {
    const d = isoToDate(v);
    return !Number.isNaN(d.getTime()) && dateToISO(d) === v;
  }, "Date invalide.")
  .refine((v) => v >= "2000-01-01" && v <= "2999-12-31", "Date hors limites.");
