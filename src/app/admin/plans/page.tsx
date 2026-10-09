import type { Metadata } from "next";
import { Info } from "lucide-react";
import { PlanEditor } from "@/components/admin/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSuperAdminPage } from "@/server/admin/context";
import { listPlans } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Plans · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPlans() {
  const admin = await requireSuperAdminPage();
  const plans = await listPlans(admin);
  return (
    <main className="grid gap-6">
      <PageHeader
        title="Plans et limites"
        description="Une limite vide signifie « illimité ». Les plafonds sont mensuels (mois calendaire, heure d'Alger)."
      />
      <p className="flex items-start gap-2 rounded-xl border bg-accent px-4 py-3 text-sm text-accent-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        Les limites Membres et Stockage ne sont pas encore appliquées par l&apos;application.
      </p>
      {plans.map((p) => (
        <Card key={p.id} className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{p.name}</h2>
            <Badge>{p.code}</Badge>
            {p.active ? <Badge tone="success">Actif</Badge> : <Badge tone="warning">Inactif</Badge>}
            <span className="tabular text-sm text-muted-foreground">
              {p.subscribers} abonné{p.subscribers > 1 ? "s" : ""}
            </span>
          </div>
          <PlanEditor plan={p} />
        </Card>
      ))}
    </main>
  );
}
