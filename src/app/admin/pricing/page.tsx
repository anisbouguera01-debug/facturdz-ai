import type { Metadata } from "next";
import { PricingForm } from "@/components/admin/admin-forms";
import { AdminTable } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSuperAdminPage } from "@/server/admin/context";
import { listPricing } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Tarifs IA · Admin" };
export const dynamic = "force-dynamic";

const df = new Intl.DateTimeFormat("fr-DZ", { dateStyle: "short", timeZone: "Africa/Algiers" });

export default async function AdminPricing() {
  const admin = await requireSuperAdminPage();
  const rows = await listPricing(admin);
  return (
    <main className="grid gap-6">
      <PageHeader
        title="Tarifs des modèles IA"
        description="Prix par million de jetons, tels que publiés par le fournisseur à la date d'effet. Aucune valeur par défaut : sans tarif, le coût d'un appel reste « inconnu » (jamais 0). Un nouveau tarif clôt le précédent (historique conservé)."
      />
      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-base font-semibold tracking-tight">Ajouter un tarif</h2>
        <PricingForm />
      </Card>
      <AdminTable
        caption="Historique des tarifs"
        head={[
          { label: "Fournisseur" },
          { label: "Modèle" },
          { label: "Entrée", align: "right" },
          { label: "Sortie", align: "right" },
          { label: "Cache", align: "right" },
          { label: "Devise" },
          { label: "Du" },
          { label: "Au" },
        ]}
        empty="Aucun tarif enregistré."
      >
        {rows.length === 0
          ? undefined
          : rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">{r.provider}</td>
                <td className="px-4 py-3">{r.model}</td>
                <td className="tabular px-4 py-3 text-right">{r.input}</td>
                <td className="tabular px-4 py-3 text-right">{r.output}</td>
                <td className="tabular px-4 py-3 text-right">{r.cachedInput ?? "—"}</td>
                <td className="px-4 py-3">{r.currency}</td>
                <td className="tabular px-4 py-3">{df.format(r.effectiveFrom)}</td>
                <td className="px-4 py-3">
                  {r.effectiveTo ? (
                    <span className="tabular">{df.format(r.effectiveTo)}</span>
                  ) : (
                    <Badge tone="success">En cours</Badge>
                  )}
                </td>
              </tr>
            ))}
      </AdminTable>
    </main>
  );
}
