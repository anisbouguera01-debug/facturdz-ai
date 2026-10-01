import { z } from "zod";
import { optionalEmail, optionalLegalId, optionalPhone, optionalText } from "./common";

export const CUSTOMER_TYPES = ["COMPANY", "INDIVIDUAL"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  COMPANY: "Entreprise",
  INDIVIDUAL: "Particulier",
};

export const customerSchema = z.object({
  type: z.enum(CUSTOMER_TYPES, { message: "Choisissez un type de client." }),
  name: z.string().trim().min(1, "Saisissez le nom du client.").max(160, "160 caractères maximum."),
  companyName: optionalText(160),
  email: optionalEmail,
  phone: optionalPhone,
  address: optionalText(300),
  wilaya: optionalText(80),
  commune: optionalText(80),
  nif: optionalLegalId,
  nis: optionalLegalId,
  rc: optionalLegalId,
  articleImposition: optionalLegalId,
  notes: optionalText(2000, "2 000 caractères maximum."),
});

export type CustomerInput = z.input<typeof customerSchema>;
export type CustomerData = z.output<typeof customerSchema>;

export const CUSTOMER_SORTS = ["name", "-createdAt", "createdAt"] as const;

/** Paramètres de liste (issus de l'URL : toujours des chaînes, d'où la coercition). */
export const customerListSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  type: z.enum(CUSTOMER_TYPES).optional().catch(undefined),
  archived: z
    .enum(["0", "1"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "1"),
  sort: z.enum(CUSTOMER_SORTS).optional().catch(undefined).default("name"),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().catch(undefined).default(25),
});

export type CustomerListParams = z.input<typeof customerListSchema>;
