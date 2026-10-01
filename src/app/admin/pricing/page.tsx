import type { Metadata } from "next";
import { PricingForm } from "@/components/admin/admin-forms";
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
      <h1 className="text-2xl font-semibold tracking-tight">Tarifs des modèles IA</h1>
      <p className="text-sm text-muted-foreground">
        Prix par million de jetons, tels que publiés par le fournisseur à la date d&apos;effet.
        Aucune valeur par défaut : sans tarif, le coût d&apos;un appel reste « inconnu » (jamais 0).
        Un nouveau tarif clôt le précédent (historique conservé).
      </p>
      <section className="rounded-lg border bg-card p-4">
        <PricingForm />
      </section>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              {["Fournisseur", "Modèle", "Entrée", "Sortie", "Cache", "Devise", "Du", "Au"].map(
                (h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.provider}</td>
                <td className="px-3 py-2">{r.model}</td>
                <td className="px-3 py-2">{r.input}</td>
                <td className="px-3 py-2">{r.output}</td>
                <td className="px-3 py-2">{r.cachedInput ?? "—"}</td>
                <td className="px-3 py-2">{r.currency}</td>
                <td className="px-3 py-2">{df.format(r.effectiveFrom)}</td>
                <td className="px-3 py-2">
                  {r.effectiveTo ? df.format(r.effectiveTo) : "en cours"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-3 text-muted-foreground">
                  Aucun tarif enregistré.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
