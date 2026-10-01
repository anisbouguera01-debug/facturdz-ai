import "server-only";
import { computeDocument, type LineData } from "@/lib/billing";
import { todayISO } from "@/lib/dates";
import { idSchema } from "@/lib/validation/common";
import {
  frameUserRequest,
  DOCUMENT_SYSTEM_PROMPT,
  CORRECTION_PROMPT,
} from "@/server/ai/prompts/document";
import { matchCustomer, matchProduct } from "@/server/ai/matching";
import { InvalidAIOutputError, runAI } from "@/server/ai/run";
import { documentProposalSchema, type CreateProposal } from "@/server/ai/schemas/document-proposal";
import { Prisma } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";
import { recordAudit } from "./audit";
import { prepareLines } from "./document-lines";
import { createInvoice } from "./invoices";
import { createQuote } from "./quotes";
import { listTaxRates } from "./tax-rates";

/**
 * Brouillons de documents proposés par l'IA.
 *
 *   demande → modèle (JSON) → validation Zod → rapprochement client/produits (serveur)
 *   → AIDraft PENDING → prévisualisation recalculée par le serveur → confirmation explicite
 *   → création d'un BROUILLON de facture/devis (jamais émis automatiquement).
 *
 * Le modèle ne voit que le texte de l'utilisateur (ni clients, ni produits, ni montants de
 * la base). Il ne fournit aucun total : tous les montants sont recalculés ici.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;
export type DocKind = "invoice" | "quote";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PROMPT_LENGTH = 1000;

interface ResolvedLine {
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string | null;
  vatRate: string | null;
  discountRate: string;
}

interface DraftPayload {
  kind: DocKind;
  prompt: string;
  proposal: CreateProposal;
  resolved: {
    customerId: string | null;
    candidates: { id: string; name: string }[];
    lines: ResolvedLine[];
  };
  warnings: string[];
}

const FEATURE = { invoice: "INVOICE_GENERATION", quote: "QUOTE_GENERATION" } as const;

const audit = (
  ctx: Ctx,
  action: Parameters<typeof recordAudit>[1]["action"],
  entityId: string,
  metadata?: Prisma.InputJsonValue,
) =>
  recordAudit(ctx.db, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action,
    entity: "AIDraft",
    entityId,
    metadata,
  });

/** Interprète la demande, enregistre un brouillon en attente et renvoie son identifiant. */
export async function proposeDocument(ctx: Ctx, kind: DocKind, prompt: string) {
  assertPermission(ctx, "ai:use");
  assertPermission(ctx, kind === "invoice" ? "invoices:create" : "quotes:write");
  assertPermission(ctx, "customers:read");
  assertPermission(ctx, "products:read");
  const text = prompt.trim();
  if (text.length < 5) throw new AppError("VALIDATION_ERROR", "Décrivez le document à créer.");
  if (text.length > MAX_PROMPT_LENGTH)
    throw new AppError(
      "VALIDATION_ERROR",
      `Demande trop longue (${MAX_PROMPT_LENGTH} caractères maximum).`,
    );

  const ask = (correction?: string) =>
    runAI(
      ctx,
      FEATURE[kind],
      (provider) =>
        provider.generateStructuredOutput(
          {
            system: DOCUMENT_SYSTEM_PROMPT,
            user: frameUserRequest(text),
            correction,
            maxOutputTokens: 1500,
          },
          documentProposalSchema,
          { name: "document_proposal" },
        ),
      (raw) => documentProposalSchema.parse(raw),
    );

  let proposal;
  try {
    proposal = (await ask()).data;
  } catch (error) {
    if (!(error instanceof InvalidAIOutputError)) throw error;
    // Une seule relance de correction ; ensuite, erreur claire et rien n'est créé.
    try {
      proposal = (await ask(CORRECTION_PROMPT)).data;
    } catch (second) {
      if (second instanceof InvalidAIOutputError) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Je n'ai pas réussi à interpréter votre demande. Reformulez-la avec le client, les quantités et les prix.",
        );
      }
      throw second;
    }
  }
  if (proposal.action === "UNSUPPORTED") {
    throw new AppError(
      "VALIDATION_ERROR",
      `Je ne peux pas traiter cette demande : ${proposal.reason}`,
    );
  }

  const [customers, products, rates] = await Promise.all([
    ctx.db.customer.findMany({
      where: { archivedAt: null },
      take: 500,
      select: { id: true, name: true, companyName: true },
    }),
    ctx.db.product.findMany({
      where: { active: true },
      take: 500,
      select: { id: true, name: true, priceHT: true, vatRate: true },
    }),
    listTaxRates(ctx),
  ]);
  const defaultRate = rates.find((r) => r.isDefault)?.rate ?? rates[0]?.rate ?? null;
  const customer = matchCustomer(proposal.customer.name, customers);

  const warnings: string[] = [];
  const lines: ResolvedLine[] = proposal.items.map((item, i) => {
    const product = matchProduct(item.description, products);
    if (!product)
      warnings.push(
        `Ligne ${i + 1} : « ${item.description} » n'est pas dans votre catalogue (saisie libre).`,
      );
    const catalogPrice = product?.priceHT.toFixed(2) ?? null;
    if (product && item.unitPrice && catalogPrice && item.unitPrice !== catalogPrice) {
      warnings.push(
        `Ligne ${i + 1} : le prix indiqué (${item.unitPrice}) diffère du prix du catalogue (${catalogPrice}) ; le prix indiqué est conservé.`,
      );
    }
    return {
      productId: product?.id ?? null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? catalogPrice,
      vatRate: item.vatRate ?? product?.vatRate.toFixed(2) ?? defaultRate,
      discountRate: item.discountRate ?? "0.00",
    };
  });

  const payload: DraftPayload = {
    kind,
    prompt: text,
    proposal,
    resolved: { customerId: customer.selectedId, candidates: customer.candidates, lines },
    warnings,
  };
  const draft = await ctx.db.aIDraft.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      feature: FEATURE[kind],
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    },
    select: { id: true },
  });
  await audit(ctx, "ai.draft_created", draft.id, { kind, lines: lines.length });
  return { id: draft.id };
}

async function loadDraft(ctx: Ctx, id: string) {
  const draft = await ctx.db.aIDraft.findUnique({ where: { id: idSchema.parse(id) } });
  // Un brouillon IA appartient à son auteur ; un autre membre ne le voit pas.
  if (!draft || draft.userId !== ctx.userId)
    throw new AppError("NOT_FOUND", "Proposition introuvable.");
  return draft;
}

function toLineData(lines: ResolvedLine[]): { data: LineData[] | null; missing: string[] } {
  const missing: string[] = [];
  lines.forEach((l, i) => {
    if (!l.unitPrice)
      missing.push(`Ligne ${i + 1} : prix unitaire manquant, précisez-le dans votre demande.`);
    if (!l.vatRate)
      missing.push(`Ligne ${i + 1} : taux de TVA manquant (configurez vos taux dans Paramètres).`);
  });
  if (missing.length) return { data: null, missing };
  return {
    data: lines.map((l) => ({
      productId: l.productId ?? undefined,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice!,
      vatRate: l.vatRate!,
      discountRate: l.discountRate,
    })) as LineData[],
    missing,
  };
}

/** Prévisualisation : lit le brouillon et RECALCULE tous les montants avec le moteur serveur. */
export async function previewDraft(ctx: Ctx, id: string) {
  assertPermission(ctx, "ai:use");
  const draft = await loadDraft(ctx, id);
  const payload = draft.payload as unknown as DraftPayload;
  const expired = draft.status === "PENDING" && draft.expiresAt.getTime() < Date.now();
  const status = expired ? "EXPIRED" : draft.status;

  const blockers: string[] = [];
  const { data, missing } = toLineData(payload.resolved.lines);
  blockers.push(...missing);

  let totals: { subtotal: string; discountTotal: string; taxTotal: string; total: string } | null =
    null;
  let lineAmounts: { subtotal: string; taxAmount: string; total: string }[] = [];
  if (data) {
    try {
      const prepared = await prepareLines(ctx.db, data);
      totals = {
        subtotal: prepared.totals.subtotal,
        discountTotal: prepared.totals.discountTotal,
        taxTotal: prepared.totals.taxTotal,
        total: prepared.totals.total,
      };
      lineAmounts = prepared.rows.map((r) => ({
        subtotal: r.subtotal,
        taxAmount: r.taxAmount,
        total: r.total,
      }));
    } catch (error) {
      if (error instanceof AppError && error.fieldErrors) {
        for (const [k, v] of Object.entries(error.fieldErrors)) {
          const n = Number(k.split(".")[1]) + 1;
          blockers.push(`Ligne ${n} : ${v[0]}`);
        }
      } else if (error instanceof AppError) blockers.push(error.message);
      else throw error;
      // Aperçu indicatif avec le moteur pur (les lignes bloquantes restent signalées).
      const c = computeDocument(data);
      lineAmounts = c.lines.map((l) => ({
        subtotal: l.subtotal.toFixed(2),
        taxAmount: l.taxAmount.toFixed(2),
        total: l.total.toFixed(2),
      }));
    }
  }

  return {
    id: draft.id,
    kind: payload.kind,
    status,
    expiresAt: draft.expiresAt,
    resultEntityId: draft.resultEntityId,
    customer: {
      selectedId: payload.resolved.customerId,
      requestedName: payload.proposal.customer.name,
      candidates: payload.resolved.candidates,
    },
    issueDate: payload.proposal.issueDate ?? null,
    dueDate: payload.kind === "invoice" ? (payload.proposal.dueDate ?? null) : null,
    expiryDate: payload.kind === "quote" ? (payload.proposal.expiryDate ?? null) : null,
    lines: payload.resolved.lines.map((l, i) => ({ ...l, amounts: lineAmounts[i] ?? null })),
    totals,
    warnings: payload.warnings,
    blockers,
  };
}

/** Confirmation explicite : crée un BROUILLON (jamais émis) et marque la proposition confirmée. */
export async function confirmDraft(ctx: Ctx, id: string, options: { customerId?: string } = {}) {
  assertPermission(ctx, "ai:use");
  const draft = await loadDraft(ctx, id);
  const payload = draft.payload as unknown as DraftPayload;
  assertPermission(ctx, payload.kind === "invoice" ? "invoices:create" : "quotes:write");

  const customerId = options.customerId ?? payload.resolved.customerId;
  if (!customerId) {
    throw new AppError("VALIDATION_ERROR", "Choisissez le client avant de confirmer.", {
      fieldErrors: { customerId: ["Choisissez le client."] },
    });
  }
  const { data, missing } = toLineData(payload.resolved.lines);
  if (!data) throw new AppError("VALIDATION_ERROR", missing[0]);

  // Revendication atomique : une seule confirmation peut aboutir, même en cas de double clic.
  const claimed = await ctx.db.aIDraft.updateMany({
    where: { id: draft.id, userId: ctx.userId, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "CONFIRMED" },
  });
  if (claimed.count !== 1) {
    throw new AppError(
      "CONFLICT",
      "Cette proposition a déjà été traitée ou a expiré. Refaites votre demande.",
    );
  }

  try {
    const base = {
      customerId,
      issueDate: payload.proposal.issueDate ?? todayISO(),
      notes: payload.proposal.notes,
      items: data.map((l) => ({ ...l })),
    };
    const created =
      payload.kind === "invoice"
        ? await createInvoice(ctx, { ...base, dueDate: payload.proposal.dueDate })
        : await createQuote(ctx, { ...base, expiryDate: payload.proposal.expiryDate });
    await ctx.db.aIDraft.update({ where: { id: draft.id }, data: { resultEntityId: created.id } });
    await audit(ctx, "ai.draft_confirmed", draft.id, { kind: payload.kind, entityId: created.id });
    return { kind: payload.kind, id: created.id };
  } catch (error) {
    // L'échec ne doit pas consommer la proposition : l'utilisateur peut corriger et réessayer.
    await ctx.db.aIDraft.updateMany({
      where: { id: draft.id, status: "CONFIRMED", resultEntityId: null },
      data: { status: "PENDING" },
    });
    throw error;
  }
}

export async function discardDraft(ctx: Ctx, id: string) {
  assertPermission(ctx, "ai:use");
  const draft = await loadDraft(ctx, id);
  const res = await ctx.db.aIDraft.updateMany({
    where: { id: draft.id, userId: ctx.userId, status: "PENDING" },
    data: { status: "DISCARDED" },
  });
  if (res.count !== 1) throw new AppError("CONFLICT", "Cette proposition a déjà été traitée.");
  await audit(ctx, "ai.draft_discarded", draft.id);
}
