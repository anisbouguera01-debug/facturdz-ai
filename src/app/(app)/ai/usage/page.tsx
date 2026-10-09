import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden } from "@/components/layout/forbidden";
import { can } from "@/lib/permissions";
import { getAIUsageSummary } from "@/server/services/ai-usage";
import { PERIODS, type Period } from "@/server/services/stats";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Consommation IA" };

const PERIOD_LABELS: Record<Period, string> = {
  THIS_MONTH: "Ce mois",
  LAST_MONTH: "Mois dernier",
  THIS_YEAR: "Cette année",
  LAST_12_MONTHS: "12 derniers mois",
};
const FEATURE_LABELS: Record<string, string> = {
  INVOICE_GENERATION: "Création de factures",
  QUOTE_GENERATION: "Création de devis",
  ANALYTICS: "Questions sur l'activité",
  CUSTOMER_MESSAGE: "Messages clients",
  GENERAL_ASSISTANT: "Assistant général",
};
const nf = new Intl.NumberFormat("fr-DZ");
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const money = (c: { currency: string; amount: string }[]) =>
  c.length === 0
    ? "Non estimé"
    : c
        .map((x) => (x.currency === "USD" ? `${x.amount} $` : `${x.amount} ${x.currency}`))
        .join(" + ");

export default async function AiUsagePage({ searchParams }: PageProps<"/ai/usage">) {
  const { context } = await requireTenantPage("/ai/usage");
  if (!can(context.role, "stats:read"))
    return <Forbidden backHref="/ai" backLabel="Retour à FacturDZ AI" />;

  const requested = first((await searchParams).period);
  const period = (PERIODS as readonly string[]).includes(requested ?? "")
    ? (requested as Period)
    : "THIS_MONTH";
  const u = await getAIUsageSummary(context, period);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/ai" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        FacturDZ AI
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Consommation IA</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Appels, jetons et coût estimé pour {context.organizationName}.
      </p>

      <nav aria-label="Période" className="mt-5 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/ai/usage?period=${p}`}
            aria-current={p === period ? "page" : undefined}
            className={`h-9 rounded-md border px-3 text-sm leading-9 outline-none focus-visible:ring-2 focus-visible:ring-ring ${p === period ? "border-primary bg-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </nav>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Appels réussis", nf.format(u.calls.success)],
          ["Jetons (entrée + sortie)", nf.format(u.tokens.total)],
          ["Coût estimé", money(u.cost)],
          ["Refusés (limite)", nf.format(u.calls.rejectedLimit)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4 shadow-card">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="tabular mt-1 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {u.uncostedCalls > 0 ? (
        <p className="mt-4 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {u.uncostedCalls} appel{u.uncostedCalls > 1 ? "s" : ""} sans tarif connu : leur coût
          n&apos;est pas inclus ci-dessus (il n&apos;est jamais compté à zéro).
        </p>
      ) : null}

      <section aria-labelledby="by-feature" className="mt-8">
        <h2 id="by-feature" className="text-base font-semibold">
          Par fonctionnalité
        </h2>
        {u.byFeature.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed bg-card/60 px-4 py-6 text-sm text-muted-foreground">
            Aucune utilisation sur cette période.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Fonctionnalité</th>
                  <th className="px-4 py-2 text-right font-medium">Appels</th>
                  <th className="px-4 py-2 text-right font-medium">Jetons</th>
                  <th className="px-4 py-2 text-right font-medium">Coût estimé</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {u.byFeature.map((f) => (
                  <tr key={f.feature}>
                    <td className="px-4 py-2">{FEATURE_LABELS[f.feature] ?? f.feature}</td>
                    <td className="tabular px-4 py-2 text-right">{nf.format(f.calls)}</td>
                    <td className="tabular px-4 py-2 text-right">{nf.format(f.tokens)}</td>
                    <td className="tabular px-4 py-2 text-right">{money(f.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        Estimation indicative d&apos;après les tarifs enregistrés ; la facture du fournisseur fait
        foi. Erreurs : {u.calls.error} · réponses invalides : {u.calls.invalidOutput}. Les demandes
        et réponses ne sont pas conservées. Les coûts sont dans la devise du tarif du fournisseur
        (souvent le dollar), pas en dinars.
      </p>
    </main>
  );
}
