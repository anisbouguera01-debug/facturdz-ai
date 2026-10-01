import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DocumentEditor } from "@/components/forms/document-editor";
import { Forbidden } from "@/components/layout/forbidden";
import { dateToISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { orNotFound } from "@/server/page-helpers";
import { loadEditorOptions } from "@/server/services/editor-options";
import { getQuote } from "@/server/services/quotes";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Modifier le devis" };

const fr = (v: string) =>
  v
    .replace(".", ",")
    .replace(/,0+$/, "")
    .replace(/(,\d*?)0+$/, "$1");

export default async function EditQuotePage({ params }: PageProps<"/quotes/[id]/edit">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/quotes/${id}/edit`);
  if (!can(context.role, "quotes:write")) {
    return <Forbidden backHref={`/quotes/${id}`} backLabel="Retour au devis" />;
  }
  const quote = await orNotFound(getQuote(context, id));
  if (quote.status !== "DRAFT") redirect(`/quotes/${id}`);
  const options = await loadEditorOptions(context, quote.customer.id);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href={`/quotes/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
        Brouillon de devis
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Modifier le devis</h1>
      <div className="mt-8">
        <DocumentEditor
          kind="quote"
          documentId={quote.id}
          customers={options.customers}
          products={options.products}
          rates={options.rates}
          defaults={{
            customerId: quote.customer.id,
            issueDate: dateToISO(quote.issueDate),
            secondDate: quote.expiryDate ? dateToISO(quote.expiryDate) : "",
            notes: quote.notes ?? "",
            terms: quote.terms ?? "",
            items: quote.items.map((it) => ({
              productId: it.productId ?? "",
              description: it.description,
              quantity: fr(it.quantity),
              unitPrice: fr(it.unitPrice),
              discountRate: it.discountRate === "0.00" ? "" : fr(it.discountRate),
              vatRate: it.vatRate,
            })),
          }}
        />
      </div>
    </main>
  );
}
