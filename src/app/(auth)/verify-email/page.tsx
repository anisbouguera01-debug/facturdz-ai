import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Confirmation de l'adresse e-mail" };

/**
 * Point d'arrivée du lien de confirmation. Succès : Better Auth ouvre la session
 * (autoSignInAfterVerification) → on continue vers l'application. Échec : ?error=… (lien expiré
 * ou déjà utilisé) → on propose de se reconnecter, ce qui renvoie un nouveau lien.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { error } = await searchParams;
  if (!error && (await getCurrentSession())) redirect("/dashboard");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {error ? "Lien invalide ou expiré" : "Adresse confirmée"}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {error
          ? "Ce lien de confirmation a expiré ou a déjà été utilisé. Connectez-vous : un nouveau lien vous sera envoyé si votre adresse n'est pas encore confirmée."
          : "Votre adresse e-mail est confirmée. Vous pouvez vous connecter."}
      </p>
      <p className="mt-8">
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Aller à la connexion
        </Link>
      </p>
    </>
  );
}
