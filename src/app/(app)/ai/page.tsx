import type { Metadata } from "next";
import { AiDraftPreview } from "@/components/forms/ai-draft-preview";
import { AiAssistant } from "@/components/forms/ai-assistant";
import { Forbidden } from "@/components/layout/forbidden";
import { can } from "@/lib/permissions";
import { AppError } from "@/server/errors";
import { serverEnv } from "@/server/env";
import { previewDraft } from "@/server/services/ai-drafts";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "FacturDZ AI" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AiPage({ searchParams }: PageProps<"/ai">) {
  const { context } = await requireTenantPage("/ai");
  if (!can(context.role, "ai:use")) return <Forbidden backHref="/dashboard" backLabel="Retour" />;

  const draftId = first((await searchParams).draft);
  let draft = null;
  if (draftId) {
    try {
      draft = await previewDraft(context, draftId);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    }
  }
  const demo = serverEnv().AI_PROVIDER === "mock";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">FacturDZ AI</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Décrivez un devis ou une facture, ou posez une question sur votre activité. L&apos;IA
        propose, le serveur calcule, vous confirmez.
      </p>
      {demo ? (
        <p className="mt-4 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Mode démonstration : un assistant simulé répond (aucun fournisseur d&apos;IA connecté).
        </p>
      ) : null}
      <div className="mt-6 grid gap-6">
        <AiAssistant
          canAsk={can(context.role, "stats:read")}
          canInvoice={can(context.role, "invoices:create") && can(context.role, "customers:read")}
          canQuote={can(context.role, "quotes:write") && can(context.role, "customers:read")}
        />
        {draft ? (
          <AiDraftPreview
            draft={{
              id: draft.id,
              kind: draft.kind,
              status: draft.status,
              requestedName: draft.customer.requestedName,
              selectedId: draft.customer.selectedId,
              candidates: draft.customer.candidates,
              lines: draft.lines.map((l) => ({
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                vatRate: l.vatRate,
                discountRate: l.discountRate,
                inCatalog: l.productId !== null,
                subtotal: l.amounts?.subtotal ?? null,
              })),
              totals: draft.totals,
              warnings: draft.warnings,
              blockers: draft.blockers,
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
