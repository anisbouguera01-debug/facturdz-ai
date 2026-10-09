import type { Metadata } from "next";
import { PackageCheck } from "lucide-react";
import { deleteProductAction, setProductActiveAction } from "@/app/(app)/products/actions";
import { ProductForm } from "@/components/forms/product-form";
import { DetailHeader, DetailLayout, InfoList, Panel } from "@/components/layout/detail";
import { RecordActions } from "@/components/layout/record-actions";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatMoney } from "@/lib/format";
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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <DetailHeader
        backHref="/products"
        backLabel="Produits et services"
        title={product.name}
        badges={
          <>
            <Badge>{PRODUCT_TYPE_LABELS[product.type]}</Badge>
            {product.active ? (
              <Badge tone="success">Actif</Badge>
            ) : (
              <Badge tone="warning">Désactivé</Badge>
            )}
          </>
        }
        subtitle={product.sku ? <span className="tabular">Réf. {product.sku}</span> : undefined}
      />

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Prix HT"
          value={formatMoney(product.priceHT)}
          note={product.unit ? `par ${product.unit}` : undefined}
        />
        <StatCard label="TVA" value={formatRate(product.vatRate)} />
        <StatCard
          label="Prix TTC"
          value={formatMoney(ttcFromHt(product.priceHT, product.vatRate).toFixed(2))}
          note="HT + TVA arrondie"
        />
        <StatCard
          label="Utilisation"
          value={String(product.usageCount)}
          note={
            product.usageCount === 0
              ? "Aucun devis ni facture"
              : `ligne${product.usageCount > 1 ? "s" : ""} de devis ou de factures`
          }
          icon={<PackageCheck />}
        />
      </dl>

      <DetailLayout
        main={
          canWrite ? (
            <Panel
              title="Modifier"
              description={
                product.usageCount > 0
                  ? "Modifier le prix ou la TVA ne change pas les devis et factures déjà créés : ils conservent les valeurs du moment."
                  : undefined
              }
            >
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
            </Panel>
          ) : (
            <Panel title="Description">
              <p className="text-sm whitespace-pre-line">
                {product.description ?? (
                  <span className="text-muted-foreground">Aucune description.</span>
                )}
              </p>
            </Panel>
          )
        }
        aside={
          <>
            <Panel title="Informations">
              <InfoList
                items={[
                  { label: "Type", value: PRODUCT_TYPE_LABELS[product.type] },
                  { label: "Référence", value: product.sku, mono: true },
                  { label: "Unité", value: product.unit },
                  { label: "Devise", value: product.currency },
                  { label: "Créé le", value: formatDate(product.createdAt), mono: true },
                  { label: "Modifié le", value: formatDate(product.updatedAt), mono: true },
                ]}
              />
            </Panel>
            {canWrite ? (
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
            ) : null}
          </>
        }
      />
    </main>
  );
}
