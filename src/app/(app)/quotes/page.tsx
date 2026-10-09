import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { QuoteStatusBadge } from "@/components/layout/quote-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { QUOTE_STATUS_LABELS } from "@/lib/quote-status";
import { QUOTE_LIST_STATUSES } from "@/lib/validation/quote";
import { listQuotes } from "@/server/services/quotes";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Devis" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function QuotesPage({ searchParams }: PageProps<"/quotes">) {
  const { context } = await requireTenantPage("/quotes");
  const sp = await searchParams;
  const params = { q: first(sp.q), status: first(sp.status), page: first(sp.page) };
  const result = await listQuotes(context, params as never);
  const canWrite = can(context.role, "quotes:write");
  const filtered = Boolean(params.q || params.status);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        title="Devis"
        description={
          <>
            {result.total} devis{filtered ? " correspondant aux filtres" : ""}
          </>
        }
        actions={
          <>
            {canWrite ? (
              <Link href="/quotes/new" className={buttonVariants()}>
                Nouveau devis
              </Link>
            ) : null}
          </>
        }
      />

      <form
        method="get"
        role="search"
        className="mt-6 grid gap-3 rounded-xl border bg-card p-3 shadow-card sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end sm:p-4"
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
            {QUOTE_LIST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {QUOTE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Filtrer
          </button>
          {filtered ? (
            <Link href="/quotes" className={buttonVariants({ variant: "ghost" })}>
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-label="Liste des devis" className="mt-6">
        {result.items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <p className="font-medium">
              {filtered
                ? "Aucun devis ne correspond à ces filtres."
                : "Aucun devis pour l'instant."}
            </p>
            {!filtered && canWrite ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Préparez une proposition chiffrée ; une fois acceptée, elle deviendra une facture.
                </p>
                <Link href="/quotes/new" className={`${buttonVariants()} mt-5`}>
                  Créer un devis
                </Link>
              </>
            ) : null}
          </div>
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
                      Validité
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Statut
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Total TTC
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((q) => (
                    <tr key={q.id} className="border-t transition-colors hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/quotes/${q.id}`}
                          className="tabular font-medium whitespace-nowrap underline-offset-4 hover:underline"
                        >
                          {q.number ?? "Brouillon"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{q.customer.name}</td>
                      <td className="tabular px-4 py-3 text-muted-foreground">
                        {formatDate(q.issueDate)}
                      </td>
                      <td className="tabular px-4 py-3 text-muted-foreground">
                        {formatDate(q.expiryDate)}
                      </td>
                      <td className="px-4 py-3">
                        <QuoteStatusBadge status={q.displayStatus} />
                      </td>
                      <td className="tabular px-4 py-3 text-right">{formatMoney(q.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-2 md:hidden">
              {result.items.map((q) => (
                <li key={q.id}>
                  <Link
                    href={`/quotes/${q.id}`}
                    className="block rounded-xl border bg-card px-4 py-3 shadow-card outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{q.customer.name}</span>
                      <span className="tabular text-sm whitespace-nowrap">
                        {formatMoney(q.total)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                      <span className="font-mono">
                        {q.number ?? "Brouillon"}, {formatDate(q.issueDate)}
                      </span>
                      <QuoteStatusBadge status={q.displayStatus} />
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
          basePath="/quotes"
          params={{ q: params.q, status: params.status }}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          label="devis"
        />
      </div>
    </main>
  );
}
