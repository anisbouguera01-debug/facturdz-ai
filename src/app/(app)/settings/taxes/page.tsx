import type { Metadata } from "next";
import { TaxRatesManager } from "@/components/forms/tax-rates-manager";
import { Forbidden } from "@/components/layout/forbidden";
import { can } from "@/lib/permissions";
import { listTaxRates } from "@/server/services/tax-rates";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "TVA" };

export default async function TaxSettingsPage() {
  const { context } = await requireTenantPage("/settings/taxes");
  if (!can(context.role, "settings:manage")) {
    return <Forbidden backHref="/dashboard" backLabel="Retour au tableau de bord" />;
  }
  const rates = await listTaxRates(context, { includeInactive: true });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-sm text-muted-foreground">Paramètres</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Taux de TVA</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Saisissez les taux applicables à votre activité selon la réglementation en vigueur ;
        FacturDZ n&apos;en impose aucun. Modifier ou désactiver un taux ne change jamais les devis
        et factures déjà créés.
      </p>
      <div className="mt-8">
        <TaxRatesManager rates={rates} />
      </div>
    </main>
  );
}
