import type { Metadata } from "next";
import { Download, Eye, FileText, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { ConvertQuoteButton } from "@/components/layout/convert-quote-button";
import { DetailHeader, DetailLayout, InfoList, Panel } from "@/components/layout/detail";
import { DocumentView } from "@/components/layout/document-view";
import { PrintButton } from "@/components/layout/print-button";
import { QuoteActions } from "@/components/layout/quote-actions";
import { QuoteStatusBadge } from "@/components/layout/quote-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { daysBetween, dateToISO, todayISO } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";
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

  const c = quote.customer;
  const place = [c.commune, c.wilaya].filter(Boolean).join(", ");
  const open = quote.status === "SENT";
  const left =
    quote.expiryDate && open ? daysBetween(todayISO(), dateToISO(quote.expiryDate)) : null;
  const validityNote =
    left === null
      ? undefined
      : left < 0
        ? `Expiré depuis ${-left} jour${-left > 1 ? "s" : ""}`
        : left === 0
          ? "Expire aujourd'hui"
          : `Expire dans ${left} jour${left > 1 ? "s" : ""}`;
  const canWrite = can(context.role, "quotes:write");
  const canConvert = quote.status === "ACCEPTED" && can(context.role, "invoices:create");
  const hasWorkflow = canWrite || can(context.role, "quotes:delete") || canConvert;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10 print:max-w-none print:p-0">
      <DetailHeader
        backHref="/quotes"
        backLabel="Devis"
        title={<span className="tabular">{quote.number ?? "Devis en brouillon"}</span>}
        badges={<QuoteStatusBadge status={quote.displayStatus} />}
        subtitle={
          <>
            Pour{" "}
            <Link
              href={`/customers/${c.id}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {c.name}
            </Link>
          </>
        }
        actions={
          <>
            <PrintButton />
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
          </>
        }
      />

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
        <StatCard
          label="Total TTC"
          value={formatMoney(quote.total)}
          note={`HT ${formatMoney(quote.subtotal)}`}
        />
        <StatCard label="Date du devis" value={formatDate(quote.issueDate)} />
        <StatCard
          label="Valable jusqu'au"
          value={formatDate(quote.expiryDate)}
          note={validityNote}
          tone={left !== null && left < 0 ? "danger" : undefined}
        />
        <StatCard
          label="Facture liée"
          value={quote.invoice ? (quote.invoice.invoiceNumber ?? "Brouillon") : "Aucune"}
          note={
            quote.invoice && can(context.role, "invoices:read")
              ? "Facture créée à partir de ce devis"
              : undefined
          }
        />
      </dl>

      <DetailLayout
        main={
          <>
            {hasWorkflow ? (
              <section
                aria-label="Actions sur le devis"
                className="grid gap-4 rounded-xl border bg-card p-4 shadow-card sm:p-5 print:hidden"
              >
                {canConvert ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent px-4 py-3">
                    <p className="text-sm text-accent-foreground">
                      Devis accepté : créez la facture correspondante (brouillon, avec les mêmes
                      lignes).
                    </p>
                    <ConvertQuoteButton quoteId={quote.id} />
                  </div>
                ) : null}
                <QuoteActions
                  id={quote.id}
                  status={quote.status}
                  canWrite={canWrite}
                  canDelete={can(context.role, "quotes:delete")}
                />
              </section>
            ) : null}
            {quote.invoice && can(context.role, "invoices:read") ? (
              <p className="flex items-center gap-2 text-sm print:hidden">
                <FileText aria-hidden className="size-4 text-muted-foreground" />
                Facture liée :
                <Link
                  href={`/invoices/${quote.invoice.id}`}
                  className="tabular font-medium underline underline-offset-4"
                >
                  {quote.invoice.invoiceNumber ?? "brouillon"}
                </Link>
              </p>
            ) : null}
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
          </>
        }
        aside={
          can(context.role, "customers:read") ? (
            <Panel
              title="Client"
              action={
                <Link
                  href={`/customers/${c.id}`}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Fiche
                </Link>
              }
            >
              <p className="font-medium">{c.name}</p>
              {c.companyName && c.companyName !== c.name ? (
                <p className="text-sm text-muted-foreground">{c.companyName}</p>
              ) : null}
              <ul className="mt-3 grid gap-2 text-sm">
                {c.email ? (
                  <li className="flex items-center gap-2 break-all">
                    <Mail aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <a href={`mailto:${c.email}`} className="underline-offset-4 hover:underline">
                      {c.email}
                    </a>
                  </li>
                ) : null}
                {c.phone ? (
                  <li className="flex items-center gap-2">
                    <Phone aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <a
                      href={`tel:${c.phone}`}
                      className="tabular underline-offset-4 hover:underline"
                    >
                      {c.phone}
                    </a>
                  </li>
                ) : null}
              </ul>
              {c.address || place ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {[c.address, place].filter(Boolean).join(", ")}
                </p>
              ) : null}
              <div className="mt-4 border-t pt-4">
                <InfoList
                  mono
                  items={[
                    { label: "NIF", value: c.nif },
                    { label: "NIS", value: c.nis },
                    { label: "RC", value: c.rc },
                    { label: "AI", value: c.articleImposition },
                  ]}
                />
              </div>
            </Panel>
          ) : undefined
        }
      />
    </main>
  );
}
