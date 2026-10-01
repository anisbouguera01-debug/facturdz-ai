import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DocumentEditor } from "@/components/forms/document-editor";
import { Forbidden } from "@/components/layout/forbidden";
import { dateToISO } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { orNotFound } from "@/server/page-helpers";
import { loadEditorOptions } from "@/server/services/editor-options";
import { getInvoice } from "@/server/services/invoices";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Modifier la facture" };

const fr = (v: string) =>
  v
    .replace(".", ",")
    .replace(/,0+$/, "")
    .replace(/(,\d*?)0+$/, "$1");

export default async function EditInvoicePage({ params }: PageProps<"/invoices/[id]/edit">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/invoices/${id}/edit`);
  if (!can(context.role, "invoices:update")) {
    return <Forbidden backHref={`/invoices/${id}`} backLabel="Retour à la facture" />;
  }
  const invoice = await orNotFound(getInvoice(context, id));
  if (invoice.status !== "DRAFT") redirect(`/invoices/${id}`);
  const options = await loadEditorOptions(context, invoice.customer.id);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <Link
        href={`/invoices/${id}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Brouillon de facture
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        Modifier la facture
      </h1>
      <div className="mt-8">
        <DocumentEditor
          kind="invoice"
          documentId={invoice.id}
          customers={options.customers}
          products={options.products}
          rates={options.rates}
          defaults={{
            customerId: invoice.customer.id,
            issueDate: dateToISO(invoice.issueDate),
            secondDate: invoice.dueDate ? dateToISO(invoice.dueDate) : "",
            notes: invoice.notes ?? "",
            terms: invoice.paymentTerms ?? "",
            items: invoice.items.map((it) => ({
              productId: it.productId ?? "",
              description: it.description,
              quantity: fr(it.quantity),
              unitPrice: fr(it.unitPrice),
              discountRate: it.discountRate === "0.00" ? "" : fr(it.discountRate),
              vatRate: it.vatRate,
            })),
          }}
        />
      </div>
    </main>
  );
}
