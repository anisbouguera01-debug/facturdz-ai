"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCustomerAction, setCustomerArchivedAction } from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

/** Archiver / restaurer / supprimer, avec confirmation explicite pour la suppression. */
export function CustomerActions({
  id,
  archived,
  canArchive,
  canDelete,
}: {
  id: string;
  archived: boolean;
  canArchive: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (
    fn: () => Promise<{ ok: boolean; error?: { message: string } }>,
    after: () => void,
  ) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) {
        setError(res.error?.message ?? "L'action a échoué.");
        setConfirming(false);
        return;
      }
      after();
    });

  if (!canArchive && !canDelete) return null;

  return (
    <div className="grid gap-3">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div className="flex flex-wrap gap-2">
        {canArchive ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => setCustomerArchivedAction(id, !archived),
                () => router.refresh(),
              )
            }
          >
            {archived ? "Restaurer le client" : "Archiver le client"}
          </Button>
        ) : null}
        {canDelete && !confirming ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
            Supprimer
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirmer la suppression"
          className="rounded-md border border-destructive/30 p-4"
        >
          <p className="text-sm">
            Supprimer définitivement ce client ? C&apos;est impossible s&apos;il a déjà des devis ou
            des factures : archivez-le dans ce cas.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteCustomerAction(id),
                  () => {
                    router.push("/customers");
                    router.refresh();
                  },
                )
              }
            >
              {pending ? "Suppression…" : "Supprimer définitivement"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Garder le client
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
