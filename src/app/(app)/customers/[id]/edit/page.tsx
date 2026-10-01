import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/forms/customer-form";
import { Forbidden } from "@/components/layout/forbidden";
import { can } from "@/lib/permissions";
import { orNotFound } from "@/server/page-helpers";
import { getCustomer } from "@/server/services/customers";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Modifier le client" };

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  const { context } = await requireTenantPage(`/customers/${id}/edit`);
  if (!can(context.role, "customers:write")) {
    return <Forbidden backHref={`/customers/${id}`} backLabel="Retour à la fiche client" />;
  }
  const c = await orNotFound(getCustomer(context, id));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <Link
        href={`/customers/${c.id}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {c.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Modifier le client</h1>
      <div className="mt-8">
        <CustomerForm
          customerId={c.id}
          defaults={{
            type: c.type,
            name: c.name,
            companyName: c.companyName,
            email: c.email,
            phone: c.phone,
            address: c.address,
            wilaya: c.wilaya,
            commune: c.commune,
            nif: c.nif,
            nis: c.nis,
            rc: c.rc,
            articleImposition: c.articleImposition,
            notes: c.notes,
          }}
        />
      </div>
    </main>
  );
}
