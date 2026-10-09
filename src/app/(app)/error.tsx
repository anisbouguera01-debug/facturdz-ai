"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Erreur inattendue : on reste dans l'application, sans détail technique affiché. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 sm:px-8">
      <EmptyState
        icon={<TriangleAlert />}
        title="Cette page n'a pas pu s'afficher"
        description="Vos données ne sont pas affectées. Réessayez ; si le problème continue, revenez au tableau de bord."
        action={<Button onClick={reset}>Réessayer</Button>}
      />
    </main>
  );
}
