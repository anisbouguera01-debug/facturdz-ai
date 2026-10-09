import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { InvoiceStatusBadge } from "@/components/layout/invoice-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Search } from "lucide-react";
import { INVOICE_STATUS_LABELS } from "@/lib/invoice-status";
import { formatDate, formatMoney } from "@/lib/format";
import { PERIOD_LABELS, resolvePeriod } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { INVOICE_LIST_STATUSES } from "@/lib/validation/invoice";
import { listInvoices } from "@/server/services/invoices";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Factures" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const { context } = await requireTenantPage("/invoices");
  const sp = await searchParams;
  const params = {
    q: first(sp.q),
    status: first(sp.status),
    customerId: first(sp.customerId),
    period: first(sp.period),
    from: first(sp.from),
    to: first(sp.to),
    page: first(sp.page),
  };
  const period = resolvePeriod(params);
  const periodActive = Boolean(period.from || period.to);
  // Les liens des préréglages conservent la recherche, le statut et le client.
  const presetHref = (preset: string | null) => {
    const sp2 = new URLSearchParams();
    if (params.q) sp2.set("q", params.q);
    if (params.status) sp2.set("status", params.status);
    if (params.customerId) sp2.set("customerId", params.customerId);
    if (preset) sp2.set("period", preset);
    const qs = sp2.toString();
    return qs ? `/invoices?${qs}` : "/invoices";
  };
  const [result, customers] = await Promise.all([
    listInvoices(context, params as never),
    can(context.role, "customers:read")
      ? context.db.customer.findMany({
          where: { archivedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
          take: 300,
        })
      : Promise.resolve([]),
  ]);
  const canCreate = can(context.role, "invoices:create");
  const filtered = Boolean(
    params.q || params.status || params.customerId || periodActive || period.error,
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        title="Factures"
        description={
          <>
            {result.total} facture{result.total > 1 ? "s" : ""}
            {filtered ? " correspondant aux filtres" : ""}
          </>
        }
        actions={
          <>
            {canCreate ? (
              <Link href="/invoices/new" className={buttonVariants()}>
                Nouvelle facture
              </Link>
            ) : null}
          </>
        }
      />

      <form
        method="get"
        role="search"
        className="mt-6 grid gap-3 rounded-xl border bg-card p-3 shadow-card sm:grid-cols-[minmax(0,1fr)_180px_200px_auto] sm:items-end sm:p-4"
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
        {customers.length > 0 ? (
          <div className="grid gap-1.5">
            <label htmlFor="customerId" className="text-sm font-medium">
              Client
            </label>
            <Select id="customerId" name="customerId" defaultValue={params.customerId ?? ""}>
              <option value="">Tous</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            <Search />
            Filtrer
          </button>
          {filtered ? (
            <Link href="/invoices" className={buttonVariants({ variant: "ghost" })}>
              Effacer
            </Link>
          ) : null}
        </div>
        {period.preset && params.period && period.preset !== "custom" ? (
          <input type="hidden" name="period" value={period.preset} />
        ) : null}
        <fieldset className="grid gap-2 sm:col-span-full">
          <legend className="text-sm font-medium">Période (date de la facture)</legend>
          <div className="flex flex-wrap items-end gap-2">
            {(["today", "week", "month", "last-month"] as const).map((preset) => {
              const active = period.preset === preset;
              return (
                <Link
                  key={preset}
                  href={presetHref(preset)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    buttonVariants({ variant: active ? "primary" : "secondary", size: "sm" }),
                  )}
                >
                  {PERIOD_LABELS[preset]}
                </Link>
              );
            })}
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <label htmlFor="from" className="text-xs text-muted-foreground">
                  Du
                </label>
                <Input
                  id="from"
                  name="from"
                  type="date"
                  className="h-9 w-40"
                  defaultValue={period.preset === "custom" ? (params.from ?? "") : ""}
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="to" className="text-xs text-muted-foreground">
                  Au
                </label>
                <Input
                  id="to"
                  name="to"
                  type="date"
                  className="h-9 w-40"
                  defaultValue={period.preset === "custom" ? (params.to ?? "") : ""}
                />
              </div>
            </div>
            {periodActive ? (
              <span className="pb-2 text-xs text-muted-foreground">
                {period.preset && period.preset !== "custom"
                  ? `${PERIOD_LABELS[period.preset]} : `
                  : ""}
                {period.from ? formatDate(period.from) : "…"} au{" "}
                {period.to ? formatDate(period.to) : "…"}
              </span>
            ) : null}
          </div>
          {period.error ? (
            <p role="alert" className="text-sm text-destructive">
              {period.error}
            </p>
          ) : null}
        </fieldset>
      </form>

      <section aria-label="Liste des factures" className="mt-6">
        {result.items.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={
              filtered
                ? "Aucune facture ne correspond à ces filtres."
                : "Aucune facture pour l'instant."
            }
            description={
              filtered
                ? "Modifiez ou effacez les filtres."
                : "Créez une facture, ou convertissez un devis accepté."
            }
            action={
              !filtered && canCreate ? (
                <Link href="/invoices/new" className={buttonVariants()}>
                  Créer une facture
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border bg-card shadow-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
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
                    <tr key={i.id} className="border-t transition-colors hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoices/${i.id}`}
                          className="tabular font-medium whitespace-nowrap underline-offset-4 hover:underline"
                        >
                          {i.invoiceNumber ?? "Brouillon"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{i.customer.name}</td>
                      <td className="tabular px-4 py-3 text-muted-foreground">
                        {formatDate(i.issueDate)}
                      </td>
                      <td className="tabular px-4 py-3 text-muted-foreground">
                        {formatDate(i.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <InvoiceStatusBadge status={i.displayStatus} />
                      </td>
                      <td className="tabular px-4 py-3 text-right">{formatMoney(i.total)}</td>
                      <td className="tabular px-4 py-3 text-right">
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
                    className="block rounded-xl border bg-card px-4 py-3 shadow-card outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{i.customer.name}</span>
                      <span className="tabular text-sm whitespace-nowrap">
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
          params={{
            q: params.q,
            status: params.status,
            customerId: params.customerId,
            period: params.period,
            from: params.from,
            to: params.to,
          }}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          label="factures"
        />
      </div>
    </main>
  );
}
