import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/validation/payment";
import { listPayments } from "@/server/services/payments";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Paiements" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const { context } = await requireTenantPage("/payments");
  const sp = await searchParams;
  const params = { q: first(sp.q), method: first(sp.method), page: first(sp.page) };
  const result = await listPayments(context, params as never);
  const filtered = Boolean(params.q || params.method);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        title="Paiements"
        description={
          <>
            {result.total} paiement{result.total > 1 ? "s" : ""}
            {filtered ? " correspondant aux filtres" : ""}. Un paiement s&apos;enregistre depuis la
            facture concernée.
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
            placeholder="Référence, facture ou client"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="method" className="text-sm font-medium">
            Mode
          </label>
          <Select id="method" name="method" defaultValue={params.method ?? ""}>
            <option value="">Tous</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Filtrer
          </button>
          {filtered ? (
            <Link href="/payments" className={buttonVariants({ variant: "ghost" })}>
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-label="Liste des paiements" className="mt-6">
        {result.items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <p className="font-medium">
              {filtered
                ? "Aucun paiement ne correspond à ces filtres."
                : "Aucun paiement pour l'instant."}
            </p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card text-sm shadow-card">
            {result.items.map((p) => (
              <li
                key={p.id}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[110px_1fr_auto] sm:items-center sm:gap-4"
              >
                <span className="tabular text-muted-foreground">{formatDate(p.paymentDate)}</span>
                <span>
                  <Link
                    href={`/invoices/${p.invoice.id}`}
                    className="tabular font-medium whitespace-nowrap underline-offset-4 hover:underline"
                  >
                    {p.invoice.invoiceNumber}
                  </Link>{" "}
                  · {p.invoice.customer.name} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.voided ? (
                    <span className="ml-2 text-xs text-destructive">Annulé : {p.voidReason}</span>
                  ) : null}
                </span>
                <span
                  className={`tabular sm:text-right ${p.voided ? "text-muted-foreground line-through" : ""}`}
                >
                  {formatMoney(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6">
        <Pagination
          basePath="/payments"
          params={{ q: params.q, method: params.method }}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          label="paiements"
        />
      </div>
    </main>
  );
}
