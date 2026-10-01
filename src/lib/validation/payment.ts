import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { Money, moneySchema } from "@/lib/money";
import { idSchema, optionalText } from "./common";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHECK", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  BANK_TRANSFER: "Virement",
  CHECK: "Chèque",
  CARD: "Carte",
  OTHER: "Autre",
};

/** Paiement reçu sur une facture. Le montant doit être strictement positif. */
export const paymentSchema = z.object({
  invoiceId: idSchema,
  amount: moneySchema.refine((v) => new Money(v).gt(0), {
    message: "Le montant doit être supérieur à zéro.",
  }),
  paymentDate: isoDateSchema,
  method: z.enum(PAYMENT_METHODS, { message: "Choisissez un mode de paiement." }),
  reference: optionalText(100, "100 caractères maximum."),
  notes: optionalText(500, "500 caractères maximum."),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const voidPaymentSchema = z.object({
  paymentId: idSchema,
  reason: z
    .string()
    .trim()
    .min(3, "Indiquez le motif de l'annulation.")
    .max(300, "300 caractères maximum."),
});

export const paymentListSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : undefined)),
  method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().catch(undefined).default(25),
});
export type PaymentListParams = z.input<typeof paymentListSchema>;
