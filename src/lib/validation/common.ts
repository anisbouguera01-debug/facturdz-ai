import { z } from "zod";

/** Texte facultatif : espaces retirés, chaîne vide → undefined. */
export const optionalText = (max: number, message = `${max} caractères maximum.`) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => (v ? v : undefined));

export const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((v) => (v ? v.toLowerCase() : undefined))
  .refine((v) => v === undefined || z.email().safeParse(v).success, {
    message: "Cette adresse e-mail n'est pas valide.",
  });

export const optionalPhone = z
  .string()
  .trim()
  .max(30, "30 caractères maximum.")
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || /^\+?[0-9 ().-]{6,}$/.test(v), {
    message: "Ce numéro de téléphone n'est pas valide.",
  });

/**
 * Identifiant légal (NIF, NIS, RC, article d'imposition).
 * Format volontairement souple : aucune règle de format officielle n'est codée
 * tant qu'elle n'a pas été vérifiée ; on refuse seulement les caractères absurdes.
 */
export const optionalLegalId = z
  .string()
  .trim()
  .max(40, "40 caractères maximum.")
  .optional()
  .transform((v) => (v ? v.toUpperCase() : undefined))
  .refine((v) => v === undefined || /^[A-Z0-9 ./-]+$/.test(v), {
    message:
      "Utilisez uniquement des lettres, chiffres, espaces, points, tirets ou barres obliques.",
  });

/** Identifiant d'enregistrement (cuid ou similaire). */
export const idSchema = z.string().min(1).max(64);
