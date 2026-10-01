import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/permissions";
import { CUSTOMER_TYPE_LABELS } from "@/lib/validation/customer";
import { listCustomers } from "@/server/services/customers";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Clients" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const { context } = await requireTenantPage("/customers");
  const sp = await searchParams;
  const params = {
    q: first(sp.q),
    type: first(sp.type),
    archived: first(sp.archived),
    page: first(sp.page),
  };
  const result = await listCustomers(context, params as never);
  const canWrite = can(context.role, "customers:write");
  const filtered = Boolean(params.q || params.type);
  const archived = params.archived === "1";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {archived ? "Clients archivés" : "Clients"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} client{result.total > 1 ? "s" : ""}
            {filtered ? " correspondant à la recherche" : ""}
          </p>
        </div>
        {canWrite && !archived ? (
          <Link href="/customers/new" className={buttonVariants()}>
            Nouveau client
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        role="search"
        className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end"
      >
        {archived ? <input type="hidden" name="archived" value="1" /> : null}
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Rechercher
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={params.q ?? ""}
            placeholder="Nom, e-mail, téléphone, NIF, wilaya"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="type" className="text-sm font-medium">
            Type
          </label>
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">Tous</option>
            <option value="COMPANY">{CUSTOMER_TYPE_LABELS.COMPANY}</option>
            <option value="INDIVIDUAL">{CUSTOMER_TYPE_LABELS.INDIVIDUAL}</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Filtrer
          </button>
          {filtered ? (
            <Link
              href={archived ? "/customers?archived=1" : "/customers"}
              className={buttonVariants({ variant: "ghost" })}
            >
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-label="Liste des clients" className="mt-6">
        {result.items.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="font-medium">
              {filtered
                ? "Aucun client ne correspond à cette recherche."
                : archived
                  ? "Aucun client archivé."
                  : "Aucun client pour l'instant."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered
                ? "Essayez un autre mot ou retirez le filtre de type."
                : !archived && canWrite
                  ? "Ajoutez votre premier client pour pouvoir lui adresser devis et factures."
                  : ""}
            </p>
            {!filtered && !archived && canWrite ? (
              <Link href="/customers/new" className={`${buttonVariants()} mt-5`}>
                Ajouter un client
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {/* Tableau (tablette et ordinateur) */}
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Client
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Contact
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Wilaya
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      NIF
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {c.name}
                        </Link>
                        <div className="mt-0.5">
                          <Badge>{CUSTOMER_TYPE_LABELS[c.type]}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div>{c.email ?? "—"}</div>
                        <div>{c.phone ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[c.commune, c.wilaya].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {c.nif ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Liste (mobile) */}
            <ul className="grid gap-2 md:hidden">
              {result.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/customers/${c.id}`}
                    className="block rounded-lg border px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{c.name}</span>
                      <Badge>{CUSTOMER_TYPE_LABELS[c.type]}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {[c.phone, c.wilaya].filter(Boolean).join(", ") || c.email || ""}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="mt-6">
        <Pagination
          basePath="/customers"
          params={{ q: params.q, type: params.type, archived: params.archived }}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          label="clients"
        />
      </div>

      <p className="mt-8 text-sm">
        <Link
          href={archived ? "/customers" : "/customers?archived=1"}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {archived ? "Retour aux clients actifs" : "Voir les clients archivés"}
        </Link>
      </p>
    </main>
  );
}
