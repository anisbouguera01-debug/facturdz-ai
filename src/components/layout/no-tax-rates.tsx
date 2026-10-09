import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Affiché quand l'entreprise n'a encore aucun taux de TVA actif. */
export function NoTaxRates({ canManage }: { canManage: boolean }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/60 px-6 py-10">
      <p className="font-medium">Aucun taux de TVA n&apos;est configuré pour votre entreprise.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {canManage
          ? "Ajoutez les taux applicables à votre activité avant de créer des produits."
          : "Demandez au propriétaire ou à un administrateur d'ajouter les taux de TVA de l'entreprise."}
      </p>
      {canManage ? (
        <Link href="/settings/taxes" className={`${buttonVariants()} mt-5`}>
          Configurer la TVA
        </Link>
      ) : null}
    </div>
  );
}
