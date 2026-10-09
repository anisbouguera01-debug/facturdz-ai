import type { Metadata } from "next";
import { Users } from "lucide-react";
import { UserStatusButton } from "@/components/admin/admin-forms";
import { AdminFilters } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { requireSuperAdminPage } from "@/server/admin/context";
import { listUsers } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Utilisateurs · Admin" };
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const q = first(sp.q);
  const status = first(sp.status);
  const page = Number(first(sp.page) ?? 1) || 1;
  const data = await listUsers(admin, { q, page, status });
  const filtered = Boolean(q || status);

  return (
    <main className="grid gap-6">
      <PageHeader
        title="Utilisateurs"
        description={`${data.total} utilisateur${data.total > 1 ? "s" : ""}${filtered ? " correspondant aux filtres" : ""}`}
      />
      <AdminFilters
        action="/admin/users"
        q={q}
        searchLabel="Rechercher"
        searchPlaceholder="E-mail ou nom"
        select={{
          name: "status",
          label: "Statut",
          value: status,
          options: [
            { value: "ACTIVE", label: "Actifs" },
            { value: "SUSPENDED", label: "Suspendus" },
          ],
        }}
        active={filtered}
      />
      {data.rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={filtered ? "Aucun utilisateur ne correspond." : "Aucun utilisateur."}
          description={filtered ? "Modifiez ou effacez les filtres." : undefined}
        />
      ) : (
        <ul className="grid gap-3">
          {data.rows.map((u) => (
            <li key={u.id}>
              <Card className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4 sm:p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{u.name}</p>
                    {u.isAdmin ? <Badge tone="info">Admin plateforme</Badge> : null}
                    {u.status === "SUSPENDED" ? (
                      <Badge tone="danger">Suspendu</Badge>
                    ) : (
                      <Badge tone="success">Actif</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm break-all text-muted-foreground">
                    {u.email} · {u.organizations} entreprise{u.organizations > 1 ? "s" : ""}
                  </p>
                </div>
                <UserStatusButton
                  userId={u.id}
                  userName={u.name}
                  status={u.status}
                  disabled={u.isAdmin || u.id === admin.userId}
                  disabledReason={
                    u.id === admin.userId
                      ? "Vous ne pouvez pas suspendre votre propre compte."
                      : u.isAdmin
                        ? "Un administrateur plateforme ne se suspend pas ici."
                        : undefined
                  }
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        basePath="/admin/users"
        params={{ q, status }}
        page={data.page}
        pageCount={Math.ceil(data.total / data.pageSize)}
        total={data.total}
        label="utilisateurs"
      />
    </main>
  );
}
