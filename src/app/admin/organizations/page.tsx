import type { Metadata } from "next";
import { SubscriptionForm } from "@/components/admin/admin-forms";
import { Pagination } from "@/components/ui/pagination";
import { requireSuperAdminPage } from "@/server/admin/context";
import { listOrganizations, listPlans } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Entreprises · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminOrganizations({
  searchParams,
}: PageProps<"/admin/organizations">) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const [data, plans] = await Promise.all([
    listOrganizations(admin, { q, page }),
    listPlans(admin),
  ]);
  const active = plans.filter((p) => p.active).map((p) => ({ code: p.code, name: p.name }));
  return (
    <main className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Entreprises</h1>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Rechercher par nom"
          aria-label="Rechercher une entreprise"
          className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
        />
        <button className="h-10 rounded-md border px-3 text-sm">Rechercher</button>
      </form>
      <ul className="grid gap-3">
        {data.rows.map((o) => (
          <li
            key={o.id}
            className="grid gap-3 rounded-xl border bg-card p-4 shadow-card lg:grid-cols-[1fr_auto]"
          >
            <div>
              <p className="font-medium">{o.name}</p>
              <p className="text-sm text-muted-foreground">
                {o.members} membre(s) · {o.invoices} facture(s) · {o.aiCallsThisMonth} appel(s) IA
                ce mois · {o.planName ? `${o.planName} (${o.status})` : "sans abonnement"}
              </p>
            </div>
            <SubscriptionForm
              organizationId={o.id}
              plans={active}
              planCode={o.planCode}
              status={o.status}
            />
          </li>
        ))}
        {data.rows.length === 0 ? (
          <li className="text-muted-foreground">Aucune entreprise.</li>
        ) : null}
      </ul>
      <Pagination
        basePath="/admin/organizations"
        params={{ q }}
        page={data.page}
        pageCount={Math.ceil(data.total / data.pageSize)}
        total={data.total}
        label="entreprises"
      />
    </main>
  );
}
