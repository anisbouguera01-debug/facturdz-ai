import { z } from "zod";
import { quantitySchema } from "@/lib/billing";
import { isoDateSchema } from "@/lib/dates";
import { moneySchema, ratePercentSchema } from "@/lib/money";

/**
 * Sortie structurée attendue du modèle pour « crée une facture / un devis ».
 * Elle est TOUJOURS revalidée ici, quelle que soit la promesse du fournisseur.
 * - Les clés inconnues sont ignorées (un modèle ne peut pas injecter `organizationId`, `total`…).
 * - Aucun total n'est demandé ni accepté : le serveur recalcule tout.
 * - Les nombres peuvent arriver en chiffres ou en texte français ; ils sont canonisés.
 */
const optionalIso = z
  .string()
  .nullish()
  .transform((v) => (v ? v : undefined))
  .pipe(isoDateSchema.optional());

const optionalMoney = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? undefined : v))
  .pipe(moneySchema.optional());

const optionalRate = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? undefined : v))
  .pipe(ratePercentSchema.optional());

export const proposalItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.preprocess((v) => (typeof v === "number" ? String(v) : v), quantitySchema),
  unitPrice: optionalMoney,
  vatRate: optionalRate,
  discountRate: optionalRate,
});

export const documentProposalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["CREATE_INVOICE", "CREATE_QUOTE"]),
    customer: z.object({ name: z.string().trim().min(1).max(200) }),
    items: z.array(proposalItemSchema).min(1).max(50),
    issueDate: optionalIso,
    dueDate: optionalIso,
    expiryDate: optionalIso,
    notes: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((v) => v || undefined),
  }),
  z.object({
    action: z.literal("UNSUPPORTED"),
    reason: z.string().trim().max(300).default("Demande non comprise."),
  }),
]);

export type DocumentProposal = z.output<typeof documentProposalSchema>;
export type CreateProposal = Extract<
  DocumentProposal,
  { action: "CREATE_INVOICE" | "CREATE_QUOTE" }
>;
