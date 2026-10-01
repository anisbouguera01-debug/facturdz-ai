import type { Metadata } from "next";
import { UserStatusButton } from "@/components/admin/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { requireSuperAdminPage } from "@/server/admin/context";
import { listUsers } from "@/server/admin/overview";

export const metadata: Metadata = { title: "Utilisateurs · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const data = await listUsers(admin, { q, page });
  return (
    <main className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Email ou nom"
          aria-label="Rechercher un utilisateur"
          className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
        />
        <button className="h-10 rounded-md border px-3 text-sm">Rechercher</button>
      </form>
      <ul className="grid gap-3">
        {data.rows.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
          >
            <div>
              <p className="font-medium">
                {u.name} {u.isAdmin ? <Badge tone="info">Admin plateforme</Badge> : null}{" "}
                {u.status === "SUSPENDED" ? <Badge tone="danger">Suspendu</Badge> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {u.email} · {u.organizations} entreprise(s)
              </p>
            </div>
            <UserStatusButton
              userId={u.id}
              status={u.status}
              disabled={u.isAdmin || u.id === admin.userId}
            />
          </li>
        ))}
      </ul>
      <Pagination
        basePath="/admin/users"
        params={{ q }}
        page={data.page}
        pageCount={Math.ceil(data.total / data.pageSize)}
        total={data.total}
        label="utilisateurs"
      />
    </main>
  );
}
