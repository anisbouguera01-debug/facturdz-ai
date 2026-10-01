import type { Metadata } from "next";
import Link from "next/link";
import { deleteProductAction, setProductActiveAction } from "@/app/(app)/products/actions";
import { ProductForm } from "@/components/forms/product-form";
import { RecordActions } from "@/components/layout/record-actions";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { formatRate, ttcFromHt } from "@/lib/money";
import { can } from "@/lib/permissions";
import { PRODUCT_TYPE_LABELS } from "@/lib/validation/product";
import { orNotFound } from "@/server/page-helpers";
import { getProduct } from "@/server/services/products";
import { listTaxRates } from "@/server/services/tax-rates";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Produit" };

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/products/${id}`);
  const product = await orNotFound(getProduct(context, id));
  const canWrite = can(context.role, "products:write");
  const rates = canWrite ? await listTaxRates(context) : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
        Produits et services
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge>{PRODUCT_TYPE_LABELS[product.type]}</Badge>
        {!product.active ? <Badge tone="warning">Désactivé</Badge> : null}
        <span>
          {product.usageCount === 0
            ? "Utilisé dans aucun document"
            : `Utilisé dans ${product.usageCount} ligne${product.usageCount > 1 ? "s" : ""} de devis ou de factures`}
        </span>
      </div>

      {canWrite ? (
        <>
          {product.usageCount > 0 ? (
            <p className="mt-6 rounded-md bg-muted px-4 py-3 text-sm">
              Modifier le prix ou la TVA ne change pas les devis et factures déjà créés : ils
              conservent les valeurs du moment.
            </p>
          ) : null}
          <div className="mt-8">
            <ProductForm
              productId={product.id}
              rates={rates}
              defaults={{
                type: product.type,
                name: product.name,
                sku: product.sku,
                unit: product.unit,
                priceHT: product.priceHT.replace(".", ","),
                vatRate: product.vatRate,
                description: product.description,
              }}
            />
          </div>
          <div className="mt-10 border-t pt-6">
            <RecordActions
              toggle={{
                label: product.active ? "Désactiver" : "Réactiver",
                action: setProductActiveAction.bind(null, product.id, !product.active),
              }}
              remove={
                can(context.role, "products:delete")
                  ? {
                      confirmText:
                        "Supprimer définitivement ce produit ? C'est impossible s'il figure déjà sur des devis ou des factures : désactivez-le dans ce cas.",
                      keepLabel: "Garder le produit",
                      action: deleteProductAction.bind(null, product.id),
                      redirectTo: "/products",
                    }
                  : undefined
              }
            />
          </div>
        </>
      ) : (
        <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Référence</dt>
          <dd className="font-mono">{product.sku ?? "—"}</dd>
          <dt className="text-muted-foreground">Unité</dt>
          <dd>{product.unit ?? "—"}</dd>
          <dt className="text-muted-foreground">Prix HT</dt>
          <dd className="font-mono tabular-nums">{formatMoney(product.priceHT)}</dd>
          <dt className="text-muted-foreground">TVA</dt>
          <dd>{formatRate(product.vatRate)}</dd>
          <dt className="text-muted-foreground">Prix TTC</dt>
          <dd className="font-mono tabular-nums">
            {formatMoney(ttcFromHt(product.priceHT, product.vatRate).toFixed(2))}
          </dd>
          <dt className="text-muted-foreground">Description</dt>
          <dd className="whitespace-pre-line">{product.description ?? "—"}</dd>
        </dl>
      )}
    </main>
  );
}
