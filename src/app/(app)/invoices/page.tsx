import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/layout/invoice-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { INVOICE_STATUS_LABELS } from "@/lib/invoice-status";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { INVOICE_LIST_STATUSES } from "@/lib/validation/invoice";
import { listInvoices } from "@/server/services/invoices";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Factures" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const { context } = await requireTenantPage("/invoices");
  const sp = await searchParams;
  const params = { q: first(sp.q), status: first(sp.status), page: first(sp.page) };
  const result = await listInvoices(context, params as never);
  const canCreate = can(context.role, "invoices:create");
  const filtered = Boolean(params.q || params.status);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Factures</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} facture{result.total > 1 ? "s" : ""}
            {filtered ? " correspondant aux filtres" : ""}
          </p>
        </div>
        {canCreate ? (
          <Link href="/invoices/new" className={buttonVariants()}>
            Nouvelle facture
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        role="search"
        className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Rechercher
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={params.q ?? ""}
            placeholder="Numéro ou client"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="status" className="text-sm font-medium">
            Statut
          </label>
          <Select id="status" name="status" defaultValue={params.status ?? ""}>
            <option value="">Tous</option>
            {INVOICE_LIST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INVOICE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Filtrer
          </button>
          {filtered ? (
            <Link href="/invoices" className={buttonVariants({ variant: "ghost" })}>
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-label="Liste des factures" className="mt-6">
        {result.items.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="font-medium">
              {filtered
                ? "Aucune facture ne correspond à ces filtres."
                : "Aucune facture pour l'instant."}
            </p>
            {!filtered && canCreate ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Créez une facture, ou convertissez un devis accepté.
                </p>
                <Link href="/invoices/new" className={`${buttonVariants()} mt-5`}>
                  Créer une facture
                </Link>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Numéro
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Client
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Échéance
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Statut
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Total TTC
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Reste à payer
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((i) => (
                    <tr key={i.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoices/${i.id}`}
                          className="font-mono underline-offset-4 hover:underline"
                        >
                          {i.invoiceNumber ?? "Brouillon"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{i.customer.name}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">
                        {formatDate(i.issueDate)}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">
                        {formatDate(i.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <InvoiceStatusBadge status={i.displayStatus} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatMoney(i.total)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {i.status === "DRAFT" || i.status === "CANCELLED"
                          ? "—"
                          : formatMoney(i.remaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-2 md:hidden">
              {result.items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/invoices/${i.id}`}
                    className="block rounded-lg border px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{i.customer.name}</span>
                      <span className="font-mono text-sm whitespace-nowrap tabular-nums">
                        {formatMoney(i.total)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                      <span className="font-mono">
                        {i.invoiceNumber ?? "Brouillon"}, {formatDate(i.issueDate)}
                      </span>
                      <InvoiceStatusBadge status={i.displayStatus} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="mt-6">
        <Pagination
          basePath="/invoices"
          params={{ q: params.q, status: params.status }}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          label="factures"
        />
      </div>
    </main>
  );
}
