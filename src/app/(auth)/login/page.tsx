import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";
import { safeRedirect } from "@/lib/safe-redirect";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  if (await getCurrentSession()) redirect(safeRedirect(nextPath));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Connexion</h1>
      <p className="mt-2 text-muted-foreground">Accédez à vos factures, devis et paiements.</p>
      <div className="mt-8">
        <LoginForm next={nextPath} />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link
          href="/register"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Créer un compte
        </Link>
      </p>
    </>
  );
}
