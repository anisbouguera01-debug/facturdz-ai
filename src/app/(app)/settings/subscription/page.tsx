import type { Metadata } from "next";
import { Forbidden } from "@/components/layout/forbidden";
import { SettingsTabs } from "@/components/layout/settings-tabs";
import { can } from "@/lib/permissions";
import { getUsageOverview } from "@/server/services/limits";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Abonnement" };

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Période d'essai",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  CANCELLED: "Résilié",
};
const nf = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 });

export default async function SubscriptionPage() {
  const { context } = await requireTenantPage("/settings/subscription");
  if (!can(context.role, "settings:manage")) {
    return <Forbidden backHref="/dashboard" backLabel="Retour au tableau de bord" />;
  }
  const { plan, rows } = await getUsageOverview(context);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <SettingsTabs current="/settings/subscription" />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Abonnement</h1>
      {plan ? (
        <p className="mt-2 text-muted-foreground">
          Plan <strong className="text-foreground">{plan.name}</strong> ·{" "}
          {STATUS_LABELS[plan.status] ?? plan.status}. Les plafonds sont mensuels (mois calendaire,
          heure d&apos;Alger) et configurables par plan.
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground">
          Aucun abonnement n&apos;est rattaché à cette entreprise : aucune limite n&apos;est
          appliquée. Contactez le support.
        </p>
      )}
      {plan?.status === "CANCELLED" ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
        >
          L&apos;abonnement est résilié : l&apos;émission de factures, la création de devis et
          l&apos;assistant IA sont désactivés. La consultation, les PDF et les paiements restent
          disponibles.
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Ressource</th>
              <th className="px-4 py-2 text-right font-medium">Utilisé</th>
              <th className="px-4 py-2 text-right font-medium">Plafond</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const full = r.limit !== null && r.used !== null && Number(r.used) >= r.limit;
              return (
                <tr key={r.key}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    {r.label}
                  </th>
                  <td className={`tabular px-4 py-2 text-right ${full ? "text-destructive" : ""}`}>
                    {r.used === null
                      ? "Non mesuré"
                      : `${nf.format(Number(r.used))}${r.unit ? ` ${r.unit}` : ""}`}
                    {full ? " (atteint)" : ""}
                  </td>
                  <td className="tabular px-4 py-2 text-right">
                    {r.limit === null
                      ? "Illimité"
                      : `${nf.format(r.limit)}${r.unit ? ` ${r.unit}` : ""}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Le changement de plan est géré par l&apos;équipe FacturDZ (aucun paiement en ligne pour
        l&apos;instant). Le stockage n&apos;est pas encore mesuré. Le budget IA ne compte que les
        appels dont le coût est estimable (tarif enregistré).
      </p>
    </main>
  );
}
