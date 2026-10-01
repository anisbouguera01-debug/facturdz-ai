import type { Metadata } from "next";
import Link from "next/link";
import { RevenueChart } from "@/components/layout/revenue-chart";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";
import { getDashboard } from "@/server/services/stats";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Tableau de bord" };

function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 font-mono text-lg font-semibold tabular-nums sm:text-2xl ${tone === "danger" ? "text-destructive" : ""}`}
      >
        {value}
      </dd>
      {note ? <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export default async function DashboardPage() {
  const { context } = await requireTenantPage("/dashboard");

  // Sans le droit « statistiques » (employé, lecture seule) : page simple, sans chiffres financiers.
  if (!can(context.role, "stats:read")) {
    const [customers, products] = await Promise.all([
      context.db.customer.count({ where: { archivedAt: null } }),
      context.db.product.count({ where: { active: true } }),
    ]);
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {context.organizationName}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Vous êtes connecté en tant que {ROLE_LABELS[context.role].toLowerCase()}.
        </p>
        <dl className="mt-8 grid max-w-md grid-cols-2 gap-4">
          <Kpi label="Clients" value={String(customers)} />
          <Kpi label="Produits et services" value={String(products)} />
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          {can(context.role, "quotes:read") ? (
            <Link href="/quotes" className={buttonVariants({ variant: "secondary" })}>
              Devis
            </Link>
          ) : null}
          {can(context.role, "invoices:read") ? (
            <Link href="/invoices" className={buttonVariants({ variant: "secondary" })}>
              Factures
            </Link>
          ) : null}
        </div>
      </main>
    );
  }

  const d = await getDashboard(context);
  const k = d.kpis;
  const canInvoices = can(context.role, "invoices:read");
  const canQuotes = can(context.role, "quotes:read");
  const todos = [
    k.quotesToInvoice > 0 && canInvoices
      ? {
          href: "/quotes?status=ACCEPTED",
          text: `${plural(k.quotesToInvoice, "devis accepté", "devis acceptés")} à facturer`,
        }
      : null,
    k.draftInvoices > 0 && canInvoices
      ? {
          href: "/invoices?status=DRAFT",
          text: `${plural(k.draftInvoices, "facture", "factures")} en brouillon à émettre`,
        }
      : null,
    k.quotesAwaitingAnswer > 0 && canQuotes
      ? {
          href: "/quotes?status=SENT",
          text: `${plural(k.quotesAwaitingAnswer, "devis", "devis")} en attente de réponse`,
        }
      : null,
  ].filter((t): t is { href: string; text: string } => t !== null);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {context.organizationName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Situation au {formatDate(d.today)} · {ROLE_LABELS[context.role]}
          </p>
        </div>
        {can(context.role, "invoices:create") ? (
          <Link href="/invoices/new" className={buttonVariants()}>
            Nouvelle facture
          </Link>
        ) : null}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Facturé ce mois (TTC)" value={formatMoney(k.invoicedThisMonth)} />
        <Kpi label="Encaissé ce mois" value={formatMoney(k.collectedThisMonth)} />
        <Kpi
          label="Reste à encaisser"
          value={formatMoney(k.outstanding)}
          note={plural(k.outstandingCount, "facture ouverte", "factures ouvertes")}
        />
        <Kpi
          label="En retard"
          value={formatMoney(k.overdue)}
          note={plural(k.overdueCount, "facture", "factures") + " à relancer"}
          tone={k.overdueCount > 0 ? "danger" : undefined}
        />
      </dl>

      <section aria-label="Évolution mensuelle" className="mt-8 rounded-lg border p-4 sm:p-5">
        <RevenueChart data={d.series} />
        <p className="mt-3 text-xs text-muted-foreground">
          Total sur 12 mois : <span className="font-mono">{formatMoney(k.invoiced12)}</span>{" "}
          facturés (TTC), <span className="font-mono">{formatMoney(k.collected12)}</span> encaissés.
          Brouillons et factures annulées exclus ; paiements annulés exclus.
        </p>
      </section>

      {todos.length > 0 ? (
        <section aria-labelledby="todo-title" className="mt-8">
          <h2 id="todo-title" className="text-base font-semibold">
            À faire
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {todos.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="block rounded-lg border px-4 py-3 text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="overdue-title">
          <h2 id="overdue-title" className="text-base font-semibold">
            Factures en retard
          </h2>
          {d.overdueInvoices.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Aucune facture en retard.
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded-lg border text-sm">
              {d.overdueInvoices.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <span>
                    <Link
                      href={`/invoices/${i.id}`}
                      className="font-mono underline-offset-4 hover:underline"
                    >
                      {i.invoiceNumber}
                    </Link>
                    <span className="block text-muted-foreground">
                      {i.customer} · échue le {formatDate(i.dueDate)}
                    </span>
                  </span>
                  <span className="font-mono whitespace-nowrap tabular-nums">
                    {formatMoney(i.remaining)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="payments-title">
          <h2 id="payments-title" className="text-base font-semibold">
            Derniers paiements
          </h2>
          {d.recentPayments.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Aucun paiement enregistré.
            </p>
          ) : (
            <ul className="mt-3 divide-y rounded-lg border text-sm">
              {d.recentPayments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <span>
                    <Link
                      href={`/invoices/${p.invoice.id}`}
                      className="font-mono underline-offset-4 hover:underline"
                    >
                      {p.invoice.invoiceNumber}
                    </Link>
                    <span className="block text-muted-foreground">
                      {p.invoice.customer.name} · {PAYMENT_METHOD_LABELS[p.method]} ·{" "}
                      {formatDate(p.paymentDate)}
                    </span>
                  </span>
                  <span className="font-mono whitespace-nowrap tabular-nums">
                    {formatMoney(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="top-title" className="lg:col-span-2">
          <h2 id="top-title" className="text-base font-semibold">
            Meilleurs clients, 12 mois
          </h2>
          {d.topCustomers.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              Pas encore de facture émise.
            </p>
          ) : (
            <ol className="mt-3 divide-y rounded-lg border text-sm">
              {d.topCustomers.map((c, i) => (
                <li
                  key={c.customerId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span>
                    <span className="mr-2 font-mono text-muted-foreground tabular-nums">
                      {i + 1}.
                    </span>
                    {can(context.role, "customers:read") ? (
                      <Link
                        href={`/customers/${c.customerId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {c.name}
                      </Link>
                    ) : (
                      c.name
                    )}
                  </span>
                  <span className="font-mono tabular-nums">{formatMoney(c.total)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
