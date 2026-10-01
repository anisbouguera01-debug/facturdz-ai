import type { Metadata } from "next";
import Link from "next/link";
import { PaymentForm } from "@/components/forms/payment-form";
import { VoidPaymentButton } from "@/components/layout/void-payment-button";
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

      {payments.length > 0 ? (
        <section aria-labelledby="payments-title" className="mt-8">
          <h2 id="payments-title" className="text-base font-semibold">
            Paiements
          </h2>
          <ul className="mt-3 divide-y rounded-lg border text-sm">
            {payments.map((p) => (
              <li
                key={p.id}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-start"
              >
                <div className={p.voided ? "text-muted-foreground line-through" : undefined}>
                  <span className="font-mono tabular-nums">{formatMoney(p.amount)}</span>
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
        <div className="mt-6">
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
