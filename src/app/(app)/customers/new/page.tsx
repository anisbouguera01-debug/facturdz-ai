import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/forms/customer-form";
import { Forbidden } from "@/components/layout/forbidden";
import { can } from "@/lib/permissions";
import { requireTenantPage } from "@/server/tenant/context";

export const metadata: Metadata = { title: "Nouveau client" };

export default async function NewCustomerPage() {
  const { context } = await requireTenantPage("/customers/new");
  if (!can(context.role, "customers:write")) {
    return <Forbidden backHref="/customers" backLabel="Retour aux clients" />;
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
      <Link href="/customers" className="text-sm text-muted-foreground hover:text-foreground">
        Clients
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Nouveau client</h1>
      <div className="mt-8">
        <CustomerForm />
      </div>
    </main>
  );
}
