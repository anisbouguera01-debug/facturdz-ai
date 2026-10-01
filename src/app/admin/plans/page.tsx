import type { Metadata } from "next";
import { PlanEditor } from "@/components/admin/admin-forms";
import { requireSuperAdminPage } from "@/server/admin/context";
import { listPlans } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Plans · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPlans() {
  const admin = await requireSuperAdminPage();
  const plans = await listPlans(admin);
  return (
    <main className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Plans et limites</h1>
      <p className="text-sm text-muted-foreground">
        Une limite vide signifie « illimité ». Les plafonds sont mensuels (mois calendaire, heure
        d&apos;Alger). Les limites Membres et Stockage ne sont pas encore appliquées par
        l&apos;application.
      </p>
      {plans.map((p) => (
        <section key={p.id} className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold">
            {p.code}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {p.subscribers} abonné(s)
            </span>
          </h2>
          <PlanEditor plan={p} />
        </section>
      ))}
    </main>
  );
}
