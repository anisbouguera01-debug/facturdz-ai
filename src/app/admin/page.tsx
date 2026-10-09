import type { Metadata } from "next";
import { AdminTable } from "@/components/admin/admin-ui";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getPlatformOverview } from "@/server/admin/overview";
import { requireSuperAdminPage } from "@/server/admin/context";

export const metadata: Metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("fr-DZ");
const df = new Intl.DateTimeFormat("fr-DZ", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Africa/Algiers",
});

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <StatCard label={label} value={String(value)} note={hint} />;
}

export default async function AdminHome() {
  const admin = await requireSuperAdminPage();
  const o = await getPlatformOverview(admin);
  const aiCalls = o.ai.byStatus.reduce((n, s) => n + s.calls, 0);
  const aiErrors = o.ai.byStatus
    .filter((s) => s.status !== "SUCCESS")
    .reduce((n, s) => n + s.calls, 0);
  const aiTokens = o.ai.byStatus.reduce((n, s) => n + s.tokens, 0);

  return (
    <main className="grid gap-8">
      <PageHeader
        title="Vue d'ensemble"
        description={`Compteurs d'exploitation uniquement : aucun contenu métier des entreprises (clients, montants, prompts) n'est accessible ici. Mois en cours depuis le ${df.format(o.monthStart)}.`}
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entreprises" value={nf.format(o.organizations)} />
        <Stat
          label="Utilisateurs actifs"
          value={nf.format(o.users.ACTIVE ?? 0)}
          hint={`${nf.format(o.users.SUSPENDED ?? 0)} suspendu(s)`}
        />
        <Stat
          label="Factures émises"
          value={nf.format(o.invoicesIssued)}
          hint={`${nf.format(o.invoicesIssuedMonth)} ce mois`}
        />
        <Stat label="Devis" value={nf.format(o.quotes)} />
      </dl>

      {o.withoutSubscription > 0 ? (
        <p
          role="alert"
          className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          {o.withoutSubscription} entreprise(s) sans abonnement : aucune limite ne s&apos;applique.
          Rattachez-les à un plan depuis « Entreprises ».
        </p>
      ) : null}

      <section>
        <h2 className="text-base font-semibold tracking-tight">Abonnements</h2>
        <div className="mt-2">
          <AdminTable
            caption="Abonnements par plan et statut"
            head={[
              { label: "Plan" },
              { label: "Statut" },
              { label: "Entreprises", align: "right" },
            ]}
            empty="Aucun abonnement."
          >
            {o.subscriptions.length === 0
              ? undefined
              : o.subscriptions.map((s) => (
                  <tr key={`${s.plan}-${s.status}`} className="border-t">
                    <td className="px-4 py-3">{s.plan}</td>
                    <td className="px-4 py-3">{s.status}</td>
                    <td className="tabular px-4 py-3 text-right font-medium">{s.count}</td>
                  </tr>
                ))}
          </AdminTable>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-base font-semibold tracking-tight">Consommation IA ce mois</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Appels" value={nf.format(aiCalls)} />
          <Stat label="Erreurs / refus" value={nf.format(aiErrors)} />
          <Stat label="Jetons" value={nf.format(aiTokens)} />
          <Stat
            label="Coût estimé"
            value={
              o.ai.cost.length === 0
                ? "—"
                : o.ai.cost.map((c) => `${Number(c.amount).toFixed(4)} ${c.currency}`).join(" + ")
            }
            hint={
              o.ai.uncostedCalls > 0
                ? `${o.ai.uncostedCalls} appel(s) sans tarif (non valorisés)`
                : "Estimation indicative"
            }
          />
        </dl>
        <div className="grid gap-6 lg:grid-cols-3">
          <SimpleTable
            title="Par modèle"
            head={["Modèle", "Appels", "Jetons"]}
            rows={o.ai.byModel.map((m) => [
              `${m.provider} ${m.model}`,
              nf.format(m.calls),
              nf.format(m.tokens),
            ])}
          />
          <SimpleTable
            title="Plus gros consommateurs"
            head={["Entreprise", "Appels", "Jetons"]}
            rows={o.ai.topOrganizations.map((t) => [
              t.name,
              nf.format(t.calls),
              nf.format(t.tokens),
            ])}
          />
          <SimpleTable
            title="Erreurs fréquentes"
            head={["Code", "Nombre"]}
            rows={o.ai.errorCodes.map((e) => [e.code, nf.format(e.count)])}
          />
        </div>
      </section>

      <SimpleTable
        title="Activité récente (tous journaux)"
        head={["Date", "Action", "Entreprise", "Utilisateur"]}
        rows={o.recentAudit.map((a) => [
          df.format(a.at),
          a.action,
          a.organization ?? "—",
          a.user ?? "—",
        ])}
      />
    </main>
  );
}

function SimpleTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <AdminTable caption={title} head={head.map((h) => ({ label: h }))} empty="Aucune donnée.">
        {rows.length === 0
          ? undefined
          : rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => (
                  <td key={j} className="tabular px-4 py-3">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
      </AdminTable>
    </section>
  );
}
