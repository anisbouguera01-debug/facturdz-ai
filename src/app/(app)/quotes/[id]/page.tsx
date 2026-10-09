import type { Metadata } from "next";
import { Download, Eye } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ConvertQuoteButton } from "@/components/layout/convert-quote-button";
import { DocumentView } from "@/components/layout/document-view";
import { QuoteActions } from "@/components/layout/quote-actions";
import { QuoteStatusBadge } from "@/components/layout/quote-status-badge";
import { can } from "@/lib/permissions";
import { orNotFound } from "@/server/page-helpers";
import { getSellerProfile } from "@/server/services/editor-options";
import { getQuote } from "@/server/services/quotes";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Devis" };

export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/quotes/${id}`);
  const [quote, seller] = await Promise.all([
    orNotFound(getQuote(context, id)),
    getSellerProfile(context),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/quotes" className="text-sm text-muted-foreground hover:text-foreground">
        Devis
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {quote.number ?? "Brouillon"}
        </h1>
        <QuoteStatusBadge status={quote.displayStatus} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Pour{" "}
        <Link
          href={`/customers/${quote.customer.id}`}
          className="underline-offset-4 hover:underline"
        >
          {quote.customer.name}
        </Link>
        {quote.displayStatus === "EXPIRED" ? ", date de validité dépassée" : ""}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`/quotes/${quote.id}/pdf`}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Eye />
          Voir le PDF
        </a>
        <a
          href={`/quotes/${quote.id}/pdf?download=1`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Download />
          Télécharger le PDF
        </a>
      </div>

      <div className="mt-6">
        <QuoteActions
          id={quote.id}
          status={quote.status}
          canWrite={can(context.role, "quotes:write")}
          canDelete={can(context.role, "quotes:delete")}
        />
      </div>

      {quote.status === "ACCEPTED" && can(context.role, "invoices:create") ? (
        <div className="mt-4 rounded-xl border bg-card bg-muted/40 p-4 shadow-card">
          <p className="mb-3 text-sm">
            Devis accepté : créez la facture correspondante (brouillon, avec les mêmes lignes).
          </p>
          <ConvertQuoteButton quoteId={quote.id} />
        </div>
      ) : null}
      {quote.invoice && can(context.role, "invoices:read") ? (
        <p className="mt-4 text-sm">
          Facture liée :{" "}
          <Link href={`/invoices/${quote.invoice.id}`} className="font-mono underline">
            {quote.invoice.invoiceNumber ?? "brouillon"}
          </Link>
        </p>
      ) : null}

      <div className="mt-8">
        <DocumentView
          title="Devis"
          number={quote.number}
          dates={[
            ["Date", quote.issueDate],
            ["Valable jusqu'au", quote.expiryDate],
          ]}
          seller={seller}
          customer={quote.customer}
          items={quote.items}
          totals={quote}
          notes={quote.notes}
          terms={quote.terms}
        />
      </div>
    </main>
  );
}
