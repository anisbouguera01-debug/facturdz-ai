import type { Metadata } from "next";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Tableau de bord" };

// Page provisoire (Phase 3). L'organisation et l'onboarding arrivent en Phase 4,
// le vrai tableau de bord en Phase 11.
export default async function DashboardPage() {
  const { user } = await requireSession("/dashboard");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="flex items-center justify-between gap-4">
        <p className="text-base font-semibold tracking-tight">
          FacturDZ <span className="text-primary">AI</span>
        </p>
        <SignOutButton />
      </header>
      <h1 className="mt-12 text-2xl font-semibold tracking-tight sm:text-3xl">
        Bonjour {user.firstName ?? user.name}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Vous êtes connecté avec {user.email}. La configuration de votre entreprise arrive à la
        prochaine étape.
      </p>
    </main>
  );
}
