import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Saisissez le nom de votre entreprise (2 caractères minimum).")
    .max(120, "120 caractères maximum."),
  legalName: optionalText(160),
  wilaya: optionalText(80),
  commune: optionalText(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^\+?[0-9 ().-]{6,}$/.test(v), {
      message: "Ce numéro de téléphone n'est pas valide.",
    }),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .refine((v) => v === undefined || z.email().safeParse(v).success, {
      message: "Cette adresse e-mail n'est pas valide.",
    }),
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type CreateOrganizationData = z.output<typeof createOrganizationSchema>;
