"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/server/errors";
import { askAssistant } from "@/server/services/ai-assistant";
import {
  confirmDraft,
  discardDraft,
  proposeDocument,
  type DocKind,
} from "@/server/services/ai-drafts";
import { requireTenant } from "@/server/tenant/context";

// IA : chaque action revérifie session, entreprise et permission ; les services revalident tout.

export async function proposeDocumentAction(kind: DocKind, prompt: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("ai:use");
    if (kind !== "invoice" && kind !== "quote") throw new Error("Type de document invalide");
    return proposeDocument(ctx, kind, String(prompt));
  });
}

export async function confirmDraftAction(id: string, customerId?: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("ai:use");
    const res = await confirmDraft(ctx, String(id), {
      customerId: customerId ? String(customerId) : undefined,
    });
    revalidatePath(res.kind === "invoice" ? "/invoices" : "/quotes");
    return res;
  });
}

export async function discardDraftAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("ai:use");
    await discardDraft(ctx, String(id));
  });
}

export async function askAssistantAction(question: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("ai:use");
    return askAssistant(ctx, String(question));
  });
}
