import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { formatRate, ttcFromHt } from "@/lib/money";
import { can } from "@/lib/permissions";
import { PRODUCT_TYPE_LABELS } from "@/lib/validation/product";
import { listProducts } from "@/server/services/products";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Produits et services" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const { context } = await requireTenantPage("/products");
  const sp = await searchParams;
  const params = {
    q: first(sp.q),
    type: first(sp.type),
    inactive: first(sp.inactive),
    page: first(sp.page),
  };
  const result = await listProducts(context, params as never);
  const canWrite = can(context.role, "products:write");
  const filtered = Boolean(params.q || params.type);
  const inactive = params.inactive === "1";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        title={inactive ? "Produits désactivés" : "Produits et services"}
        description={
          <>
            {result.total} élément{result.total > 1 ? "s" : ""}
            {filtered ? " correspondant à la recherche" : ""}
          </>
        }
        actions={
          <>
            {canWrite && !inactive ? (
              <Link href="/products/new" className={buttonVariants()}>
                Nouveau produit ou service
              </Link>
            ) : null}
          </>
        }
      />

      <form
        method="get"
        role="search"
        className="mt-6 grid gap-3 rounded-xl border bg-card p-3 shadow-card sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end sm:p-4"
      >
        {inactive ? <input type="hidden" name="inactive" value="1" /> : null}
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Rechercher
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={params.q ?? ""}
            placeholder="Désignation, référence, description"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="type" className="text-sm font-medium">
            Type
          </label>
          <Select id="type" name="type" defaultValue={params.type ?? ""}>
            <option value="">Tous</option>
            <option value="PRODUCT">Produits</option>
            <option value="SERVICE">Services</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Filtrer
          </button>
          {filtered ? (
            <Link
              href={inactive ? "/products?inactive=1" : "/products"}
              className={buttonVariants({ variant: "ghost" })}
            >
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <section aria-label="Catalogue" className="mt-6">
        {result.items.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <p className="font-medium">
              {filtered
                ? "Aucun élément ne correspond à cette recherche."
                : inactive
                  ? "Aucun produit désactivé."
                  : "Votre catalogue est vide."}
            </p>
            {!filtered && !inactive && canWrite ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enregistrez vos produits et services pour les ajouter en un clic à vos devis et
                  factures.
                </p>
                <Link href="/products/new" className={`${buttonVariants()} mt-5`}>
                  Ajouter un produit ou service
                </Link>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border bg-card shadow-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Désignation
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Unité
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Prix HT
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      TVA
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Prix TTC
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((p) => (
                    <tr key={p.id} className="border-t transition-colors hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/products/${p.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge>{PRODUCT_TYPE_LABELS[p.type]}</Badge>
                          {p.sku ? (
                            <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.unit ?? "—"}</td>
                      <td className="tabular px-4 py-3 text-right">{formatMoney(p.priceHT)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatRate(p.vatRate)}
                      </td>
                      <td className="tabular px-4 py-3 text-right">
                        {formatMoney(ttcFromHt(p.priceHT, p.vatRate).toFixed(2))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-2 md:hidden">
              {result.items.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/products/${p.id}`}
                    className="block rounded-xl border bg-card px-4 py-3 shadow-card outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{p.name}</span>
                      <span className="tabular text-sm whitespace-nowrap">
                        {formatMoney(p.priceHT)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {PRODUCT_TYPE_LABELS[p.type]}
                      {p.unit ? `, par ${p.unit}` : ""}, HT, TVA {formatRate(p.vatRate)}
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
          basePath="/products"
          params={{ q: params.q, type: params.type, inactive: params.inactive }}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          label="éléments"
        />
      </div>
      <p className="mt-8 text-sm">
        <Link
          href={inactive ? "/products" : "/products?inactive=1"}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {inactive ? "Retour au catalogue actif" : "Voir les produits désactivés"}
        </Link>
      </p>
    </main>
  );
}
