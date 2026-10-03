import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mot de passe oublié</h1>
      <p className="mt-2 text-muted-foreground">
        Saisissez l&apos;adresse de votre compte : nous vous enverrons un lien pour choisir un
        nouveau mot de passe.
      </p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </>
  );
}
