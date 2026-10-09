import type { Metadata } from "next";
import Link from "next/link";
import { deleteCustomerAction, setCustomerArchivedAction } from "@/app/(app)/customers/actions";
import { RecordActions } from "@/components/layout/record-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { displayStatus, INVOICE_STATUS_LABELS } from "@/lib/invoice-status";
import { can } from "@/lib/permissions";
import { CUSTOMER_TYPE_LABELS } from "@/lib/validation/customer";
import { orNotFound } from "@/server/page-helpers";
import { getCustomer, getCustomerStats, listCustomerInvoices } from "@/server/services/customers";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Client" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/customers/${id}`);
  const customer = await orNotFound(getCustomer(context, id));
  const canSeeInvoices = can(context.role, "invoices:read");
  const [stats, invoices] = await Promise.all([
    getCustomerStats(context, id),
    canSeeInvoices ? listCustomerInvoices(context, id) : Promise.resolve([]),
  ]);
  const canWrite = can(context.role, "customers:write");

  const contact: [string, string | null][] = [
    ["E-mail", customer.email],
    ["Téléphone", customer.phone],
    ["Adresse", customer.address],
    ["Commune", customer.commune],
    ["Wilaya", customer.wilaya],
  ];
  const legal: [string, string | null][] = [
    ["NIF", customer.nif],
    ["NIS", customer.nis],
    ["Registre de commerce", customer.rc],
    ["Article d'imposition", customer.articleImposition],
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/customers" className="text-sm text-muted-foreground hover:text-foreground">
        Clients
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{customer.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>{CUSTOMER_TYPE_LABELS[customer.type]}</Badge>
            {customer.archivedAt ? (
              <Badge tone="warning">Archivé le {formatDate(customer.archivedAt)}</Badge>
            ) : null}
            {customer.companyName ? (
              <span className="text-sm text-muted-foreground">{customer.companyName}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(context.role, "quotes:write") && !customer.archivedAt ? (
            <Link href={`/quotes/new?customerId=${customer.id}`} className={buttonVariants()}>
              Nouveau devis
            </Link>
          ) : null}
          {canWrite ? (
            <Link
              href={`/customers/${customer.id}/edit`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Modifier
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Factures", String(stats.invoiceCount)],
          ["Total facturé", formatMoney(stats.totalInvoiced)],
          ["Total payé", formatMoney(stats.totalPaid)],
          ["Reste à payer", formatMoney(stats.totalUnpaid)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-card">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1 text-lg sm:text-xl">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section aria-labelledby="coord" className="grid content-start gap-6">
          <div>
            <h2 id="coord" className="text-base font-semibold">
              Coordonnées
            </h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {contact.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="text-base font-semibold">Informations légales</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {legal.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-xs leading-5">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          {customer.notes ? (
            <div>
              <h2 className="text-base font-semibold">Notes internes</h2>
              <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">
                {customer.notes}
              </p>
            </div>
          ) : null}
          <RecordActions
            toggle={
              canWrite
                ? {
                    label: customer.archivedAt ? "Restaurer le client" : "Archiver le client",
                    action: setCustomerArchivedAction.bind(null, customer.id, !customer.archivedAt),
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
        </section>

        {canSeeInvoices ? (
          <section aria-labelledby="history">
            <h2 id="history" className="text-base font-semibold">
              Dernières factures
            </h2>
            {invoices.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
                Aucune facture pour ce client.
              </p>
            ) : (
              <ul className="mt-3 divide-y rounded-xl border bg-card shadow-card">
                {invoices.map((inv) => {
                  const status = displayStatus(inv.status, inv.dueDate);
                  return (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-mono">{inv.invoiceNumber ?? "Brouillon"}</p>
                        <p className="text-muted-foreground">{formatDate(inv.issueDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular">{formatMoney(inv.total.toFixed(2))}</p>
                        <Badge
                          tone={
                            status === "OVERDUE"
                              ? "danger"
                              : status === "PAID"
                                ? "success"
                                : "neutral"
                          }
                        >
                          {INVOICE_STATUS_LABELS[status]}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
