import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/** Better Auth redirige ici avec ?token=… (valide) ou ?error=INVALID_TOKEN. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && !error;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Nouveau mot de passe</h1>
      <div className="mt-8">
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div role="alert" className="grid gap-4">
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              Ce lien de réinitialisation est invalide ou a expiré.
            </p>
            <Link
              href="/forgot-password"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Demander un nouveau lien
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
