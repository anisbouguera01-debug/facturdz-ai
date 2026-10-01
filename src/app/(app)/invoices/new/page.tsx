import type { Metadata } from "next";
import Link from "next/link";
import { DocumentEditor } from "@/components/forms/document-editor";
import { Forbidden } from "@/components/layout/forbidden";
import { NoTaxRates } from "@/components/layout/no-tax-rates";
import { buttonVariants } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { loadEditorOptions } from "@/server/services/editor-options";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Nouvelle facture" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/invoices/new">) {
  const { context } = await requireTenantPage("/invoices/new");
  if (!can(context.role, "invoices:create")) {
    return <Forbidden backHref="/invoices" backLabel="Retour aux factures" />;
  }
  const { customerId } = await searchParams;
  const options = await loadEditorOptions(context);
  const preselected =
    typeof customerId === "string" && options.customers.some((c) => c.id === customerId)
      ? customerId
      : "";
  const defaultRate = options.rates.find((r) => r.isDefault)?.rate ?? options.rates[0]?.rate ?? "";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/invoices" className="text-sm text-muted-foreground hover:text-foreground">
        Factures
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Nouvelle facture</h1>
      <div className="mt-8">
        {options.rates.length === 0 ? (
          <NoTaxRates canManage={can(context.role, "settings:manage")} />
        ) : options.customers.length === 0 ? (
          <div className="rounded-lg border border-dashed px-6 py-10">
            <p className="font-medium">Aucun client pour l&apos;instant.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Une facture s&apos;adresse à un client : créez-le d&apos;abord.
            </p>
            {can(context.role, "customers:write") ? (
              <Link href="/customers/new" className={`${buttonVariants()} mt-5`}>
                Ajouter un client
              </Link>
            ) : null}
          </div>
        ) : (
          <DocumentEditor
            kind="invoice"
            customers={options.customers}
            products={options.products}
            rates={options.rates}
            defaults={{
              customerId: preselected,
              issueDate: todayISO(),
              secondDate: "",
              notes: "",
              terms: "",
              items: [
                {
                  productId: "",
                  description: "",
                  quantity: "1",
                  unitPrice: "",
                  discountRate: "",
                  vatRate: defaultRate,
                },
              ],
            }}
          />
        )}
      </div>
    </main>
  );
}
