"use server";

import { revalidatePath } from "next/cache";
import type { QuoteInput } from "@/lib/validation/quote";
import { safeAction } from "@/server/errors";
import {
  createQuote,
  deleteQuote,
  duplicateQuote,
  respondToQuote,
  sendQuote,
  updateQuote,
} from "@/server/services/quotes";
import { requireTenant } from "@/server/tenant/context";

// Devis : chaque action revérifie session, entreprise et permission ; le service recalcule tout.

const refresh = (id?: string) => {
  revalidatePath("/quotes");
  if (id) revalidatePath(`/quotes/${id}`);
};

export async function createQuoteAction(input: QuoteInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("quotes:write");
    const q = await createQuote(ctx, input);
    refresh();
    return { id: q.id };
  });
}

export async function updateQuoteAction(id: string, input: QuoteInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("quotes:write");
    const q = await updateQuote(ctx, id, input);
    refresh(q.id);
    return { id: q.id };
  });
}

export async function sendQuoteAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("quotes:write");
    const res = await sendQuote(ctx, id);
    refresh(id);
    return res;
  });
}

export async function acceptQuoteAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("quotes:write");
    await respondToQuote(ctx, id, "ACCEPTED");
    refresh(id);
  });
}

export async function rejectQuoteAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("quotes:write");
    await respondToQuote(ctx, id, "REJECTED");
    refresh(id);
  });
}

export async function duplicateQuoteAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("quotes:write");
    const q = await duplicateQuote(ctx, id);
    refresh();
    return { id: q.id };
  });
}

export async function deleteQuoteAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("quotes:delete");
    await deleteQuote(ctx, id);
    refresh();
  });
}
