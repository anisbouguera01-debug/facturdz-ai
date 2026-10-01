import type { Metadata } from "next";
import Link from "next/link";
import { DocumentView } from "@/components/layout/document-view";
import { InvoiceActions } from "@/components/layout/invoice-actions";
import { InvoiceStatusBadge } from "@/components/layout/invoice-status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { orNotFound } from "@/server/page-helpers";
import { getSellerProfile } from "@/server/services/editor-options";
import { getInvoice } from "@/server/services/invoices";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Facture" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/invoices/${id}`);
  const invoice = await orNotFound(getInvoice(context, id));
  // Facture émise : coordonnées figées à l'émission ; brouillon : coordonnées actuelles.
  const seller = invoice.sellerSnapshot ?? (await getSellerProfile(context));
  const showPayment = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/invoices" className="text-sm text-muted-foreground hover:text-foreground">
        Factures
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
          {invoice.invoiceNumber ?? "Brouillon"}
        </h1>
        <InvoiceStatusBadge status={invoice.displayStatus} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Pour{" "}
        <Link
          href={`/customers/${invoice.customer.id}`}
          className="underline-offset-4 hover:underline"
        >
          {invoice.customer.name}
        </Link>
        {invoice.dueDate && invoice.displayStatus === "OVERDUE"
          ? `, échéance dépassée (${formatDate(invoice.dueDate)})`
          : ""}
        {invoice.quote ? (
          <>
            {" · issue du devis "}
            {can(context.role, "quotes:read") ? (
              <Link
                href={`/quotes/${invoice.quote.id}`}
                className="font-mono underline-offset-4 hover:underline"
              >
                {invoice.quote.number}
              </Link>
            ) : (
              <span className="font-mono">{invoice.quote.number}</span>
            )}
          </>
        ) : null}
      </p>

      <div className="mt-6">
        <InvoiceActions
          id={invoice.id}
          status={invoice.status}
          hasPayments={invoice.amountPaid !== "0.00"}
          canUpdate={can(context.role, "invoices:update")}
          canIssue={can(context.role, "invoices:issue")}
          canCancel={can(context.role, "invoices:cancel")}
          canDelete={can(context.role, "invoices:delete")}
        />
      </div>

      {showPayment ? (
        <dl className="mt-6 grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg bg-muted p-4 text-sm">
          <dt className="text-muted-foreground">Total TTC</dt>
          <dd className="text-right font-mono tabular-nums">{formatMoney(invoice.total)}</dd>
          <dt className="text-muted-foreground">Déjà payé</dt>
          <dd className="text-right font-mono tabular-nums">{formatMoney(invoice.amountPaid)}</dd>
          <dt className="font-semibold">Reste à payer</dt>
          <dd className="text-right font-mono font-semibold tabular-nums">
            {formatMoney(invoice.remaining)}
          </dd>
        </dl>
      ) : null}

      <div className="mt-8">
        <DocumentView
          title="Facture"
          number={invoice.invoiceNumber}
          dates={[
            ["Date", invoice.issueDate],
            ["Échéance", invoice.dueDate],
          ]}
          seller={seller}
          customer={invoice.customerParty}
          items={invoice.items}
          totals={invoice}
          notes={invoice.notes}
          terms={invoice.paymentTerms}
        />
      </div>
    </main>
  );
}
