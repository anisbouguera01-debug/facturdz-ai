import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateOrganizationForm } from "@/components/forms/create-organization-form";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";

export const metadata: Metadata = { title: "Votre entreprise" };

/**
 * Première étape après l'inscription : créer l'entreprise.
 * Un utilisateur déjà membre d'une entreprise peut en créer une autre via ?nouvelle=1.
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { user } = await requireSession("/onboarding");
  const { nouvelle } = await searchParams;
  const memberships = await getDb().organizationMember.count({ where: { userId: user.id } });
  const isAdditional = memberships > 0;
  if (isAdditional && nouvelle !== "1") redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-8">
        <Link
          href={isAdditional ? "/dashboard" : "/onboarding"}
          className="font-semibold tracking-tight"
        >
          FacturDZ <span className="text-primary">AI</span>
        </Link>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 sm:px-8 sm:pt-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {isAdditional ? "Ajouter une entreprise" : `Bienvenue ${user.firstName ?? ""}`.trim()}
            </h1>
            <p className="mt-3 max-w-md text-muted-foreground">
              {isAdditional
                ? "Chaque entreprise a ses propres clients, produits, factures et numérotation. Vous passerez de l'une à l'autre depuis le menu."
                : "Commencez par l'entreprise qui émettra les factures. Vous en serez le propriétaire et pourrez inviter vos collaborateurs."}
            </p>
          </div>
          <section className="rounded-lg border bg-card p-5 sm:p-8">
            <CreateOrganizationForm />
          </section>
        </div>
      </main>
    </div>
  );
}
