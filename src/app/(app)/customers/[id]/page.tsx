import type { Metadata } from "next";
import { FilePlus2, Pencil, ScrollText } from "lucide-react";
import Link from "next/link";
import { deleteCustomerAction, setCustomerArchivedAction } from "@/app/(app)/customers/actions";
import { DetailHeader, DetailLayout, InfoList, Panel } from "@/components/layout/detail";
import { InvoiceStatusBadge } from "@/components/layout/invoice-status-badge";
import { QuoteStatusBadge } from "@/components/layout/quote-status-badge";
import { RecordActions } from "@/components/layout/record-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatMoney } from "@/lib/format";
import { displayStatus } from "@/lib/invoice-status";
import { can } from "@/lib/permissions";
import { CUSTOMER_TYPE_LABELS } from "@/lib/validation/customer";
import { orNotFound } from "@/server/page-helpers";
import {
  getCustomer,
  getCustomerOverdue,
  getCustomerStats,
  listCustomerInvoices,
  listCustomerQuotes,
} from "@/server/services/customers";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Client" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/customers/${id}`);
  const customer = await orNotFound(getCustomer(context, id));
  const canSeeInvoices = can(context.role, "invoices:read");
  const canSeeQuotes = can(context.role, "quotes:read");
  const [stats, overdue, invoices, quotes] = await Promise.all([
    getCustomerStats(context, id),
    canSeeInvoices ? getCustomerOverdue(context, id) : Promise.resolve(null),
    canSeeInvoices ? listCustomerInvoices(context, id) : Promise.resolve([]),
    canSeeQuotes ? listCustomerQuotes(context, id) : Promise.resolve([]),
  ]);
  const canWrite = can(context.role, "customers:write");
  const active = !customer.archivedAt;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <DetailHeader
        backHref="/customers"
        backLabel="Clients"
        title={customer.name}
        badges={
          <>
            <Badge>{CUSTOMER_TYPE_LABELS[customer.type]}</Badge>
            {customer.archivedAt ? (
              <Badge tone="warning">Archivé le {formatDate(customer.archivedAt)}</Badge>
            ) : null}
          </>
        }
        subtitle={
          customer.companyName && customer.companyName !== customer.name
            ? customer.companyName
            : undefined
        }
        actions={
          <>
            {canWrite ? (
              <Link
                href={`/customers/${customer.id}/edit`}
                className={buttonVariants({ variant: "secondary" })}
              >
                <Pencil />
                Modifier
              </Link>
            ) : null}
            {can(context.role, "invoices:create") && active ? (
              <Link
                href={`/invoices/new?customerId=${customer.id}`}
                className={buttonVariants({ variant: "secondary" })}
              >
                <FilePlus2 />
                Nouvelle facture
              </Link>
            ) : null}
            {can(context.role, "quotes:write") && active ? (
              <Link href={`/quotes/new?customerId=${customer.id}`} className={buttonVariants()}>
                <ScrollText />
                Nouveau devis
              </Link>
            ) : null}
          </>
        }
      />

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total facturé"
          value={formatMoney(stats.totalInvoiced)}
          note={`${stats.invoiceCount} facture${stats.invoiceCount > 1 ? "s" : ""} émise${stats.invoiceCount > 1 ? "s" : ""}`}
        />
        <StatCard label="Total payé" value={formatMoney(stats.totalPaid)} tone="success" />
        <StatCard label="Reste à payer" value={formatMoney(stats.totalUnpaid)} />
        <StatCard
          label="Dont en retard"
          value={overdue ? formatMoney(overdue.amount) : "—"}
          tone={overdue && overdue.count > 0 ? "danger" : undefined}
          note={
            overdue
              ? overdue.count > 0
                ? `${overdue.count} facture${overdue.count > 1 ? "s" : ""} échue${overdue.count > 1 ? "s" : ""}`
                : "Aucune facture échue"
              : undefined
          }
        />
      </dl>

      <DetailLayout
        main={
          <>
            {canSeeInvoices ? (
              <Panel title="Factures" description="Les 10 plus récentes.">
                {invoices.length === 0 ? (
                  <EmptyState
                    title="Aucune facture pour ce client."
                    description="Créez une facture pour commencer à suivre ses règlements."
                    className="border-0 shadow-none"
                  />
                ) : (
                  <ul className="-mx-2 divide-y">
                    {invoices.map((inv) => {
                      const status = displayStatus(inv.status, inv.dueDate);
                      const open = inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID";
                      return (
                        <li key={inv.id}>
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-3 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="min-w-0">
                              <span className="tabular block font-medium">
                                {inv.invoiceNumber ?? "Brouillon"}
                              </span>
                              <span className="text-muted-foreground">
                                {formatDate(inv.issueDate)}
                                {open && inv.dueDate ? `, échéance ${formatDate(inv.dueDate)}` : ""}
                              </span>
                            </span>
                            <span className="flex items-center gap-3">
                              <InvoiceStatusBadge status={status} />
                              <span className="tabular w-28 text-right font-medium">
                                {formatMoney(inv.total.toFixed(2))}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            ) : null}
            {canSeeQuotes ? (
              <Panel title="Devis" description="Les 10 plus récents.">
                {quotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun devis pour ce client.</p>
                ) : (
                  <ul className="-mx-2 divide-y">
                    {quotes.map((q) => (
                      <li key={q.id}>
                        <Link
                          href={`/quotes/${q.id}`}
                          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-2 py-3 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0">
                            <span className="tabular block font-medium">
                              {q.number ?? "Brouillon"}
                            </span>
                            <span className="text-muted-foreground">
                              {formatDate(q.issueDate)}
                              {q.expiryDate ? `, valable jusqu'au ${formatDate(q.expiryDate)}` : ""}
                            </span>
                          </span>
                          <span className="flex items-center gap-3">
                            <QuoteStatusBadge status={q.displayStatus} />
                            <span className="tabular w-28 text-right font-medium">
                              {formatMoney(q.total)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}
          </>
        }
        aside={
          <>
            <Panel title="Coordonnées">
              <InfoList
                items={[
                  {
                    label: "E-mail",
                    value: customer.email ? (
                      <a
                        href={`mailto:${customer.email}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {customer.email}
                      </a>
                    ) : null,
                  },
                  {
                    label: "Téléphone",
                    value: customer.phone ? (
                      <a
                        href={`tel:${customer.phone}`}
                        className="tabular underline-offset-4 hover:underline"
                      >
                        {customer.phone}
                      </a>
                    ) : null,
                  },
                  { label: "Adresse", value: customer.address },
                  { label: "Commune", value: customer.commune },
                  { label: "Wilaya", value: customer.wilaya },
                ]}
              />
            </Panel>
            <Panel title="Informations légales">
              <InfoList
                mono
                items={[
                  { label: "NIF", value: customer.nif },
                  { label: "NIS", value: customer.nis },
                  { label: "RC", value: customer.rc },
                  { label: "Art. d'imposition", value: customer.articleImposition },
                ]}
              />
            </Panel>
            {customer.notes ? (
              <Panel title="Notes internes">
                <p className="text-sm whitespace-pre-line text-muted-foreground">
                  {customer.notes}
                </p>
              </Panel>
            ) : null}
            <RecordActions
              toggle={
                canWrite
                  ? {
                      label: customer.archivedAt ? "Restaurer le client" : "Archiver le client",
                      action: setCustomerArchivedAction.bind(
                        null,
                        customer.id,
                        !customer.archivedAt,
                      ),
                    }
                  : undefined
              }
              remove={
                can(context.role, "customers:delete")
                  ? {
                      confirmText:
                        "Supprimer définitivement ce client ? C'est impossible s'il a déjà des devis ou des factures : archivez-le dans ce cas.",
                      keepLabel: "Garder le client",
                      action: deleteCustomerAction.bind(null, customer.id),
                      redirectTo: "/customers",
                    }
                  : undefined
              }
            />
          </>
        }
      />
    </main>
  );
}
