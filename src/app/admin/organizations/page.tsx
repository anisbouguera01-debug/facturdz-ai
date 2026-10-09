import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { SubscriptionForm } from "@/components/admin/admin-forms";
import { AdminFilters } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { requireSuperAdminPage } from "@/server/admin/context";
import { listOrganizations, listPlans } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Entreprises · Admin" };
export const dynamic = "force-dynamic";

const SUB_FILTERS = [
  { value: "NONE", label: "Sans abonnement" },
  { value: "TRIALING", label: "Essai" },
  { value: "ACTIVE", label: "Actif" },
  { value: "PAST_DUE", label: "Paiement en retard" },
  { value: "CANCELLED", label: "Résilié" },
];
const STATUS_TONE = {
  ACTIVE: "success",
  TRIALING: "info",
  PAST_DUE: "warning",
  CANCELLED: "danger",
} as const;
const STATUS_LABEL = Object.fromEntries(SUB_FILTERS.map((f) => [f.value, f.label]));

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminOrganizations({
  searchParams,
}: PageProps<"/admin/organizations">) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const q = first(sp.q);
  const subscription = first(sp.subscription);
  const page = Number(first(sp.page) ?? 1) || 1;
  const [data, plans] = await Promise.all([
    listOrganizations(admin, { q, page, subscription }),
    listPlans(admin),
  ]);
  const active = plans.filter((p) => p.active).map((p) => ({ code: p.code, name: p.name }));
  const filtered = Boolean(q || subscription);

  return (
    <main className="grid gap-6">
      <PageHeader
        title="Entreprises"
        description={`${data.total} entreprise${data.total > 1 ? "s" : ""}${filtered ? " correspondant aux filtres" : ""}`}
      />
      <AdminFilters
        action="/admin/organizations"
        q={q}
        searchLabel="Rechercher"
        searchPlaceholder="Nom de l'entreprise"
        select={{
          name: "subscription",
          label: "Abonnement",
          value: subscription,
          options: SUB_FILTERS,
        }}
        active={filtered}
      />
      {data.rows.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={filtered ? "Aucune entreprise ne correspond." : "Aucune entreprise."}
          description={filtered ? "Modifiez ou effacez les filtres." : undefined}
        />
      ) : (
        <ul className="grid gap-3">
          {data.rows.map((o) => (
            <li key={o.id}>
              <Card className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{o.name}</p>
                    {o.status ? (
                      <Badge tone={STATUS_TONE[o.status as keyof typeof STATUS_TONE]}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    ) : (
                      <Badge tone="warning">Sans abonnement</Badge>
                    )}
                    {o.planName ? <Badge>{o.planName}</Badge> : null}
                  </div>
                  <p className="tabular mt-1 text-sm text-muted-foreground">
                    {o.members} membre{o.members > 1 ? "s" : ""} · {o.invoices} facture
                    {o.invoices > 1 ? "s" : ""} · {o.aiCallsThisMonth} appel
                    {o.aiCallsThisMonth > 1 ? "s" : ""} IA ce mois
                  </p>
                </div>
                <SubscriptionForm
                  organizationId={o.id}
                  organizationName={o.name}
                  plans={active}
                  planCode={o.planCode}
                  status={o.status}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        basePath="/admin/organizations"
        params={{ q, subscription }}
        page={data.page}
        pageCount={Math.ceil(data.total / data.pageSize)}
        total={data.total}
        label="entreprises"
      />
    </main>
  );
}
