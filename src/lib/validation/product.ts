import { z } from "zod";
import { moneySchema, ratePercentSchema } from "@/lib/money";
import { optionalText } from "./common";

export const PRODUCT_TYPES = ["PRODUCT", "SERVICE"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  PRODUCT: "Produit",
  SERVICE: "Service",
};

export const productSchema = z.object({
  type: z.enum(PRODUCT_TYPES, { message: "Choisissez produit ou service." }),
  name: z.string().trim().min(1, "Saisissez la désignation.").max(200, "200 caractères maximum."),
  sku: z
    .string()
    .trim()
    .max(60, "60 caractères maximum.")
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .refine((v) => v === undefined || /^[A-Z0-9._/-]+$/.test(v), {
      message: "Lettres, chiffres, points, tirets et barres obliques uniquement, sans espace.",
    }),
  description: optionalText(2000, "2 000 caractères maximum."),
  unit: optionalText(30),
  priceHT: moneySchema,
  vatRate: ratePercentSchema,
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;

export const productListSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  type: z.enum(PRODUCT_TYPES).optional().catch(undefined),
  inactive: z
    .enum(["0", "1"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "1"),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().catch(undefined).default(25),
});
export type ProductListParams = z.input<typeof productListSchema>;

export const taxRateSchema = z.object({
  label: z.string().trim().min(1, "Saisissez un libellé.").max(60, "60 caractères maximum."),
  rate: ratePercentSchema,
  isDefault: z.boolean().optional().default(false),
});
export type TaxRateInput = z.input<typeof taxRateSchema>;
