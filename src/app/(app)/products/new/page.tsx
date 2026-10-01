import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/forms/product-form";
import { Forbidden } from "@/components/layout/forbidden";
import { NoTaxRates } from "@/components/layout/no-tax-rates";
import { can } from "@/lib/permissions";
import { listTaxRates } from "@/server/services/tax-rates";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Nouveau produit ou service" };

export default async function NewProductPage() {
  const { context } = await requireTenantPage("/products/new");
  if (!can(context.role, "products:write")) {
    return <Forbidden backHref="/products" backLabel="Retour au catalogue" />;
  }
  const rates = await listTaxRates(context);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/products" className="text-sm text-muted-foreground hover:text-foreground">
        Produits et services
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        Nouveau produit ou service
      </h1>
      <div className="mt-8">
        {rates.length === 0 ? (
          <NoTaxRates canManage={can(context.role, "settings:manage")} />
        ) : (
          <ProductForm rates={rates} />
        )}
      </div>
    </main>
  );
}
