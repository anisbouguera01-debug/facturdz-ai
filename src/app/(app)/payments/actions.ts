"use server";

import { revalidatePath } from "next/cache";
import type { PaymentInput } from "@/lib/validation/payment";
import { safeAction } from "@/server/errors";
import { recordPayment, voidPayment } from "@/server/services/payments";
import { requireTenant } from "@/server/tenant/context";

// Paiements : chaque action revérifie session, entreprise et permission ; le service
// verrouille la facture, contrôle le reste à payer et recalcule statut et montant payé.

const refresh = (invoiceId?: string) => {
  revalidatePath("/payments");
  revalidatePath("/invoices");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
};

export async function recordPaymentAction(input: PaymentInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("payments:write");
    const res = await recordPayment(ctx, input);
    refresh(input.invoiceId);
    return res;
  });
}

export async function voidPaymentAction(paymentId: string, invoiceId: string, reason: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("payments:write");
    const res = await voidPayment(ctx, { paymentId, reason });
    refresh(invoiceId);
    return res;
  });
}
