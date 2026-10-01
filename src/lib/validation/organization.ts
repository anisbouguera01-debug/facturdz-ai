import { z } from "zod";
import { optionalEmail, optionalPhone, optionalText } from "./common";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Saisissez le nom de votre entreprise (2 caractères minimum).")
    .max(120, "120 caractères maximum."),
  legalName: optionalText(160),
  wilaya: optionalText(80),
  commune: optionalText(80),
  phone: optionalPhone,
  email: optionalEmail,
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type CreateOrganizationData = z.output<typeof createOrganizationSchema>;
