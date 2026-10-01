import type { Metadata } from "next";
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
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compteurs d&apos;exploitation uniquement : aucun contenu métier des entreprises (clients,
          montants, prompts) n&apos;est accessible ici. Mois en cours depuis le{" "}
          {df.format(o.monthStart)}.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      {o.withoutSubscription > 0 ? (
        <p role="alert" className="rounded-md border border-warning/40 px-3 py-2 text-sm">
          {o.withoutSubscription} entreprise(s) sans abonnement : aucune limite ne s&apos;applique.
          Rattachez-les à un plan depuis « Entreprises ».
        </p>
      ) : null}

      <section>
        <h2 className="font-semibold">Abonnements</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {o.subscriptions.length === 0 ? <li className="text-muted-foreground">Aucun.</li> : null}
          {o.subscriptions.map((s) => (
            <li key={`${s.plan}-${s.status}`}>
              {s.plan} · {s.status} : <strong>{s.count}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="font-semibold">Consommation IA ce mois</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
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
    <section>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-2 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={head.length} className="px-3 py-3 text-muted-foreground">
                  Aucune donnée.
                </td>
              </tr>
            ) : null}
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
