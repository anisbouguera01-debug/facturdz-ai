import { z } from "zod";
import { lineInputSchema, MAX_LINES } from "@/lib/billing";
import { isoDateSchema } from "@/lib/dates";
import { idSchema, optionalText } from "./common";

/**
 * Facture en brouillon. `terms` (conditions de règlement) est enregistré dans
 * `paymentTerms`. Les montants ne sont jamais acceptés du client : seules les lignes
 * (quantité, prix, remise, taux) le sont, le serveur recalcule tout.
 */
export const invoiceSchema = z
  .object({
    customerId: idSchema.refine(Boolean, "Choisissez un client."),
    issueDate: isoDateSchema,
    dueDate: z
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
  .refine((q) => !q.dueDate || q.dueDate >= q.issueDate, {
    path: ["dueDate"],
    message: "L'échéance ne peut pas précéder la date de la facture.",
  });

export type InvoiceInput = z.input<typeof invoiceSchema>;
export type InvoiceData = z.output<typeof invoiceSchema>;

export const INVOICE_LIST_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;

export const invoiceListSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  status: z.enum(INVOICE_LIST_STATUSES).optional().catch(undefined),
  customerId: z.string().max(64).optional().catch(undefined),
  /** Période sur la date d'émission (voir src/lib/periods.ts). */
  period: z.string().max(20).optional().catch(undefined),
  from: z.string().max(10).optional().catch(undefined),
  to: z.string().max(10).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().catch(undefined).default(25),
});
export type InvoiceListParams = z.input<typeof invoiceListSchema>;
