import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Affiché quand le rôle ne permet pas l'action demandée. */
export function Forbidden({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Action non autorisée</h1>
      <p className="mt-2 text-muted-foreground">
        Votre rôle dans cette entreprise ne permet pas cette action. Demandez au propriétaire ou à
        un administrateur de modifier vos droits.
      </p>
      <Link href={backHref} className={`${buttonVariants({ variant: "secondary" })} mt-6`}>
        {backLabel}
      </Link>
    </main>
  );
}
