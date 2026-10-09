import type { Metadata } from "next";
import Link from "next/link";
import { RevenueChart } from "@/components/layout/revenue-chart";
import { InvoiceStatusBadge } from "@/components/layout/invoice-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  Banknote,
  CircleAlert,
  FileText,
  Receipt,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  FileSignature,
  Plus,
} from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { Money } from "@/lib/money";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/payment";
import { listCustomers } from "@/server/services/customers";
import { listInvoices } from "@/server/services/invoices";
import { getDashboard } from "@/server/services/stats";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Tableau de bord" };

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Évolution du mois en cours par rapport au précédent (Decimal ; rien si le mois précédent est nul). */
function evolution(series: { invoiced: string }[]): string | null {
  if (series.length < 2) return null;
  const cur = new Money(series[series.length - 1].invoiced);
  const prev = new Money(series[series.length - 2].invoiced);
  if (prev.lte(0)) return null;
  const pct = cur.minus(prev).dividedBy(prev).times(100).toDecimalPlaces(0);
  // Au-delà de ±999 %, la comparaison n'apporte rien (mois précédent quasi vide) : on ne l'affiche pas.
  if (pct.abs().gt(999)) return null;
  return `${pct.gte(0) ? "+" : "−"}${pct.abs().toFixed(0)} % par rapport au mois précédent`;
}

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("fr-FR", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Algiers",
    }).format(new Date()),
  );
  return h >= 18 || h < 5 ? "Bonsoir" : "Bonjour";
}

export default async function DashboardPage() {
  const { context } = await requireTenantPage("/dashboard");

  // Sans le droit « statistiques » (employé, lecture seule) : page simple, sans chiffres financiers.
  if (!can(context.role, "stats:read")) {
    const [customers, products] = await Promise.all([
      context.db.customer.count({ where: { archivedAt: null } }),
      context.db.product.count({ where: { active: true } }),
    ]);
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <PageHeader
          title={context.organizationName}
          description={`Vous êtes connecté en tant que ${ROLE_LABELS[context.role].toLowerCase()}.`}
        />
        <dl className="mt-8 grid max-w-md grid-cols-2 gap-4">
          <StatCard label="Clients" value={String(customers)} icon={<Users />} />
          <StatCard label="Produits et services" value={String(products)} icon={<Receipt />} />
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

  const canInvoices = can(context.role, "invoices:read");
  const canCustomers = can(context.role, "customers:read");
  const [d, recentInvoices, recentCustomers] = await Promise.all([
    getDashboard(context),
    canInvoices ? listInvoices(context, { pageSize: 5 } as never) : null,
    canCustomers ? listCustomers(context, { pageSize: 5 } as never) : null,
  ]);
  const k = d.kpis;
  const canQuotes = can(context.role, "quotes:read");
  const evo = evolution(d.series);
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

  const quick = [
    can(context.role, "quotes:write") && {
      href: "/quotes/new",
      label: "Nouveau devis",
      icon: <FileSignature />,
    },
    can(context.role, "customers:write") && {
      href: "/customers/new",
      label: "Nouveau client",
      icon: <UserPlus />,
    },
    can(context.role, "ai:use") && {
      href: "/ai",
      label: "Demander à FacturDZ AI",
      icon: <Sparkles />,
    },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title={`${greeting()}, ${context.organizationName}`}
        description={`Situation au ${formatDate(d.today)}`}
        actions={
          <>
            {quick.slice(0, 2).map((q) => (
              <Link key={q.href} href={q.href} className={buttonVariants({ variant: "secondary" })}>
                {q.icon}
                {q.label}
              </Link>
            ))}
            {can(context.role, "invoices:create") ? (
              <Link
                href="/invoices/new"
                className={buttonVariants({ className: "max-sm:order-first max-sm:w-full" })}
              >
                <Plus />
                Nouvelle facture
              </Link>
            ) : null}
          </>
        }
      />

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Facturé ce mois (TTC)"
          value={formatMoney(k.invoicedThisMonth)}
          note={evo ?? undefined}
          icon={<FileText />}
        />
        <StatCard
          label="Encaissé ce mois"
          value={formatMoney(k.collectedThisMonth)}
          icon={<Banknote />}
          tone="success"
        />
        <StatCard
          label="Reste à encaisser"
          value={formatMoney(k.outstanding)}
          note={plural(k.outstandingCount, "facture ouverte", "factures ouvertes")}
          icon={<Wallet />}
        />
        <StatCard
          label="En retard"
          value={formatMoney(k.overdue)}
          note={plural(k.overdueCount, "facture", "factures") + " à relancer"}
          tone={k.overdueCount > 0 ? "danger" : undefined}
          icon={<CircleAlert />}
        />
      </dl>

      <Card className="mt-6">
        <section aria-label="Évolution mensuelle" className="p-4 pt-2 sm:p-5 sm:pt-2">
          <RevenueChart data={d.series} />
          <p className="mt-3 text-xs text-muted-foreground">
            Total sur 12 mois : <span className="tabular">{formatMoney(k.invoiced12)}</span>{" "}
            facturés (TTC), <span className="tabular">{formatMoney(k.collected12)}</span> encaissés.
            Brouillons et factures annulées exclus ; paiements annulés exclus.
          </p>
        </section>
      </Card>

      {todos.length > 0 ? (
        <section aria-labelledby="todo-title" className="mt-6">
          <h2 id="todo-title" className="text-base font-semibold">
            À faire
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {todos.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="block rounded-xl border bg-card px-4 py-3 text-sm shadow-card transition-colors hover:bg-accent"
                >
                  {t.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {recentInvoices ? (
          <Card>
            <CardHeader
              title="Dernières factures"
              action={
                <Link
                  href="/invoices"
                  className="text-sm font-medium text-highlight hover:underline"
                >
                  Tout voir
                </Link>
              }
            />
            {recentInvoices.items.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState
                  icon={<FileText />}
                  title="Aucune facture pour le moment"
                  description="Créez votre première facture pour suivre vos encaissements ici."
                  action={
                    can(context.role, "invoices:create") ? (
                      <Link href="/invoices/new" className={buttonVariants()}>
                        Créer une facture
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {recentInvoices.items.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/invoices/${i.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{i.customer.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {i.invoiceNumber ?? "Brouillon"} · {formatDate(i.issueDate)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular font-medium">{formatMoney(i.total)}</span>
                        <InvoiceStatusBadge status={i.displayStatus} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Factures en retard" />
          {d.overdueInvoices.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
              Aucune facture en retard.
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {d.overdueInvoices.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/invoices/${i.id}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{i.invoiceNumber}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.customer} · échue le {formatDate(i.dueDate)}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-medium text-destructive">
                      {formatMoney(i.remaining)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Derniers paiements" />
          {d.recentPayments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
              Aucun paiement enregistré.
            </p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {d.recentPayments.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/invoices/${p.invoice.id}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{p.invoice.invoiceNumber}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.invoice.customer.name} · {PAYMENT_METHOD_LABELS[p.method]} ·{" "}
                        {formatDate(p.paymentDate)}
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-medium text-success">
                      {formatMoney(p.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {recentCustomers ? (
          <Card>
            <CardHeader
              title="Derniers clients"
              action={
                <Link
                  href="/customers"
                  className="text-sm font-medium text-highlight hover:underline"
                >
                  Tout voir
                </Link>
              }
            />
            {recentCustomers.items.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState
                  icon={<Users />}
                  title="Aucun client enregistré"
                  description="Ajoutez un client pour pouvoir lui adresser un devis ou une facture."
                  action={
                    can(context.role, "customers:write") ? (
                      <Link href="/customers/new" className={buttonVariants()}>
                        Ajouter un client
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y text-sm">
                {recentCustomers.items.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/customers/${c.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "Aucune coordonnée"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card className="lg:col-span-2">
          <CardHeader title="Meilleurs clients" description="12 derniers mois" />
          {d.topCustomers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
              Pas encore de facture émise.
            </p>
          ) : (
            <ol className="mt-3 divide-y text-sm">
              {d.topCustomers.map((c, i) => (
                <li
                  key={c.customerId}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="min-w-0 truncate">
                    <span className="tabular mr-2 text-muted-foreground">{i + 1}.</span>
                    {canCustomers ? (
                      <Link
                        href={`/customers/${c.customerId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {c.name}
                      </Link>
                    ) : (
                      c.name
                    )}
                  </span>
                  <span className="tabular shrink-0 font-medium">{formatMoney(c.total)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </main>
  );
}
