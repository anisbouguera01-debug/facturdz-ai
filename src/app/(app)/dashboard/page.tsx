import type { Metadata } from "next";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Tableau de bord" };

// Page provisoire : le vrai tableau de bord (chiffre d'affaires, impayés, graphiques)
// arrive en Phase 11. Elle sert ici à vérifier le contexte d'entreprise.
export default async function DashboardPage() {
  const { context } = await requireTenantPage("/dashboard");
  const [customers, products] = await Promise.all([
    context.db.customer.count(),
    context.db.product.count(),
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
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Clients</dt>
          <dd className="mt-1 font-mono text-2xl tabular-nums">{customers}</dd>
        </div>
        <div className="rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">Produits et services</dt>
          <dd className="mt-1 font-mono text-2xl tabular-nums">{products}</dd>
        </div>
      </dl>
    </main>
  );
}
