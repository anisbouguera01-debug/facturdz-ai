import type { Metadata } from "next";
import { Download, Eye } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PaymentForm } from "@/components/forms/payment-form";
import { VoidPaymentButton } from "@/components/layout/void-payment-button";
import { DetailHeader } from "@/components/layout/detail";
import { PrintButton } from "@/components/layout/print-button";
import { DocumentView } from "@/components/layout/document-view";
import { InvoiceActions } from "@/components/layout/invoice-actions";
import { InvoiceStatusBadge } from "@/components/layout/invoice-status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { orNotFound } from "@/server/page-helpers";
import { getSellerProfile } from "@/server/services/editor-options";
import { getInvoice } from "@/server/services/invoices";
import { listInvoicePayments } from "@/server/services/payments";
import { todayISO } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Facture" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/invoices/${id}`);
  const invoice = await orNotFound(getInvoice(context, id));
  // Facture émise : coordonnées figées à l'émission ; brouillon : coordonnées actuelles.
  const seller = invoice.sellerSnapshot ?? (await getSellerProfile(context));
  const canSeePayments = can(context.role, "payments:read");
  const canPay = can(context.role, "payments:write");
  const payments =
    canSeePayments && invoice.status !== "DRAFT" ? await listInvoicePayments(context, id) : [];
  const acceptsPayment = invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID";
  const showPayment = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10 print:max-w-none print:p-0">
      <DetailHeader
        backHref="/invoices"
        backLabel="Factures"
        title={<span className="tabular">{invoice.invoiceNumber ?? "Facture en brouillon"}</span>}
        badges={<InvoiceStatusBadge status={invoice.displayStatus} />}
        subtitle={
          <>
            Pour{" "}
            <Link
              href={`/customers/${invoice.customer.id}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
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
                    className="tabular font-medium whitespace-nowrap text-foreground underline-offset-4 hover:underline"
                  >
                    {invoice.quote.number}
                  </Link>
                ) : (
                  <span className="tabular">{invoice.quote.number}</span>
                )}
              </>
            ) : null}
          </>
        }
        actions={
          <>
            <PrintButton />
            <a
              href={`/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <Eye />
              Voir le PDF
            </a>
            <a
              href={`/invoices/${invoice.id}/pdf?download=1`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <Download />
              Télécharger le PDF
            </a>
          </>
        }
      />

      <div className="mt-6 print:hidden">
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
        <dl className="mt-6 grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg bg-muted p-4 text-sm print:hidden">
          <dt className="text-muted-foreground">Total TTC</dt>
          <dd className="tabular text-right">{formatMoney(invoice.total)}</dd>
          <dt className="text-muted-foreground">Déjà payé</dt>
          <dd className="tabular text-right">{formatMoney(invoice.amountPaid)}</dd>
          <dt className="font-semibold">Reste à payer</dt>
          <dd className="tabular text-right font-semibold">{formatMoney(invoice.remaining)}</dd>
        </dl>
      ) : null}

      {payments.length > 0 ? (
        <section aria-labelledby="payments-title" className="mt-8 print:hidden">
          <h2 id="payments-title" className="text-base font-semibold">
            Paiements
          </h2>
          <ul className="mt-3 divide-y rounded-xl border bg-card text-sm shadow-card">
            {payments.map((p) => (
              <li
                key={p.id}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-start"
              >
                <div className={p.voided ? "text-muted-foreground line-through" : undefined}>
                  <span className="tabular">{formatMoney(p.amount)}</span>
                  {" · "}
                  {PAYMENT_METHOD_LABELS[p.method]}
                  {" · "}
                  {formatDate(p.paymentDate)}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.notes ? <span className="block text-xs">{p.notes}</span> : null}
                </div>
                <div className="text-right">
                  {p.voided ? (
                    <span className="text-xs text-destructive">Annulé : {p.voidReason}</span>
                  ) : canPay && invoice.status !== "CANCELLED" ? (
                    <VoidPaymentButton paymentId={p.id} invoiceId={invoice.id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canPay && acceptsPayment ? (
        <div className="mt-6 print:hidden">
          <PaymentForm
            invoiceId={invoice.id}
            remaining={formatMoney(invoice.remaining)}
            today={todayISO()}
          />
        </div>
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
