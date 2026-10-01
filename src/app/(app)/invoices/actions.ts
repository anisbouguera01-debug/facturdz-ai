"use server";

import { revalidatePath } from "next/cache";
import type { InvoiceInput } from "@/lib/validation/invoice";
import { safeAction } from "@/server/errors";
import {
  cancelInvoice,
  createInvoice,
  createInvoiceFromQuote,
  deleteInvoice,
  issueInvoice,
  updateInvoice,
} from "@/server/services/invoices";
import { requireTenant } from "@/server/tenant/context";

// Factures : chaque action revérifie session, entreprise et permission ; le service recalcule tout.

const refresh = (id?: string) => {
  revalidatePath("/invoices");
  if (id) revalidatePath(`/invoices/${id}`);
};

export async function createInvoiceAction(input: InvoiceInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("invoices:create");
    const inv = await createInvoice(ctx, input);
    refresh();
    return { id: inv.id };
  });
}

export async function updateInvoiceAction(id: string, input: InvoiceInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("invoices:update");
    const inv = await updateInvoice(ctx, id, input);
    refresh(inv.id);
    return { id: inv.id };
  });
}

export async function issueInvoiceAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("invoices:issue");
    const res = await issueInvoice(ctx, id);
    refresh(id);
    return res;
  });
}

export async function cancelInvoiceAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("invoices:cancel");
    await cancelInvoice(ctx, id);
    refresh(id);
  });
}

export async function deleteInvoiceAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("invoices:delete");
    await deleteInvoice(ctx, id);
    refresh();
  });
}

export async function convertQuoteAction(quoteId: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("invoices:create");
    const inv = await createInvoiceFromQuote(ctx, quoteId);
    refresh();
    revalidatePath("/quotes");
    revalidatePath(`/quotes/${quoteId}`);
    return { id: inv.id };
  });
}
