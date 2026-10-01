import { z } from "zod";
import { lineInputSchema, MAX_LINES } from "@/lib/billing";
import { isoDateSchema } from "@/lib/dates";
import { idSchema, optionalText } from "./common";

export const quoteSchema = z
  .object({
    customerId: idSchema.refine(Boolean, "Choisissez un client."),
    issueDate: isoDateSchema,
    expiryDate: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(isoDateSchema.optional()),
    notes: optionalText(2000, "2 000 caractères maximum."),
    terms: optionalText(2000, "2 000 caractères maximum."),
    items: z
      .array(lineInputSchema)
      .min(1, "Ajoutez au moins une ligne.")
      .max(MAX_LINES, `${MAX_LINES} lignes au maximum.`),
  })
  .refine((q) => !q.expiryDate || q.expiryDate >= q.issueDate, {
    path: ["expiryDate"],
    message: "La date de validité doit suivre la date du devis.",
  });

export type QuoteInput = z.input<typeof quoteSchema>;
export type QuoteData = z.output<typeof quoteSchema>;

export const QUOTE_LIST_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
] as const;

export const quoteListSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  status: z.enum(QUOTE_LIST_STATUSES).optional().catch(undefined),
  customerId: z.string().max(64).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().catch(undefined).default(25),
});
export type QuoteListParams = z.input<typeof quoteListSchema>;
