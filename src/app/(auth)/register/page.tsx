import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/forms/register-form";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Créer votre compte</h1>
      <p className="mt-2 text-muted-foreground">
        Vous configurerez votre entreprise juste après : raison sociale, NIF, logo.
      </p>
      <div className="mt-8">
        <RegisterForm />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Déjà inscrit ?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Se connecter
        </Link>
      </p>
    </>
  );
}
