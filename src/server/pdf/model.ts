import "server-only";
import type { InvoiceDetail } from "@/server/services/invoices";
import type { QuoteDetail } from "@/server/services/quotes";
import { getSellerProfile } from "@/server/services/editor-options";
import type { TenantContext } from "@/server/tenant/resolve";

/**
 * Modèle neutre d'un document imprimable. Il ne contient que des valeurs DÉJÀ stockées
 * par le serveur (montants en chaînes décimales exactes) : le PDF ne recalcule rien.
 */
export interface PdfParty {
  name: string;
  legalName?: string | null;
  companyName?: string | null;
  address?: string | null;
  commune?: string | null;
  wilaya?: string | null;
  phone?: string | null;
  email?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  articleImposition?: string | null;
}

export interface PdfModel {
  kind: "invoice" | "quote";
  title: string; // « Facture » | « Devis »
  number: string | null;
  statusLabel: string | null;
  watermark: string | null;
  currency: string;
  dates: [string, Date | null][];
  seller: PdfParty;
  customer: PdfParty;
  items: {
    description: string;
    quantity: string;
    unitPrice: string;
    discountRate: string;
    vatRate: string;
    subtotal: string;
    /** TVA de la ligne, déjà arrondie et stockée. */
    taxAmount: string;
  }[];
  totals: { subtotal: string; discountTotal: string; taxTotal: string; total: string };
  payment: { paid: string; remaining: string } | null;
  notes: string | null;
  notesLabel: string;
  terms: string | null;
  termsLabel: string;
}

type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

export async function invoiceModel(ctx: Ctx, inv: InvoiceDetail): Promise<PdfModel> {
  // Facture émise : coordonnées figées à l'émission ; brouillon : coordonnées actuelles.
  const seller = inv.sellerSnapshot ?? (await getSellerProfile(ctx));
  const issued = inv.status !== "DRAFT";
  return {
    kind: "invoice",
    title: "Facture",
    number: inv.invoiceNumber,
    statusLabel: inv.status === "PAID" ? "Payée" : null,
    watermark: inv.status === "DRAFT" ? "BROUILLON" : inv.status === "CANCELLED" ? "ANNULÉE" : null,
    currency: inv.currency,
    dates: [
      ["Date", inv.issueDate],
      ["Échéance", inv.dueDate],
    ],
    seller,
    customer: inv.customerParty,
    items: inv.items,
    totals: inv,
    payment:
      issued && inv.status !== "CANCELLED"
        ? { paid: inv.amountPaid, remaining: inv.remaining }
        : null,
    notes: inv.notes,
    notesLabel: "Notes",
    terms: inv.paymentTerms,
    termsLabel: "Conditions de règlement",
  };
}

export async function quoteModel(ctx: Ctx, q: QuoteDetail): Promise<PdfModel> {
  return {
    kind: "quote",
    title: "Devis",
    number: q.number,
    statusLabel: null,
    watermark: q.status === "DRAFT" ? "BROUILLON" : null,
    currency: q.currency,
    dates: [
      ["Date", q.issueDate],
      ["Valable jusqu'au", q.expiryDate],
    ],
    seller: await getSellerProfile(ctx),
    customer: q.customer,
    items: q.items,
    totals: q,
    payment: null,
    notes: q.notes,
    notesLabel: "Notes",
    terms: q.terms,
    termsLabel: "Conditions",
  };
}
