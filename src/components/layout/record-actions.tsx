"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

type Result = { ok: boolean; error?: { message: string } };

/**
 * Bouton d'état (archiver / désactiver…) + suppression avec confirmation explicite.
 * Les actions sont des server actions déjà liées à l'enregistrement (`.bind`).
 */
export function RecordActions({
  toggle,
  remove,
}: {
  toggle?: { label: string; action: () => Promise<Result> };
  remove?: {
    confirmText: string;
    keepLabel: string;
    action: () => Promise<Result>;
    redirectTo: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<Result>, after: () => void) =>
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

  if (!toggle && !remove) return null;

  return (
    <div className="grid gap-3">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div className="flex flex-wrap gap-2">
        {toggle ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(toggle.action, () => router.refresh())}
          >
            {toggle.label}
          </Button>
        ) : null}
        {remove && !confirming ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
            Supprimer
          </Button>
        ) : null}
      </div>
      {remove && confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirmer la suppression"
          className="rounded-md border border-destructive/30 p-4"
        >
          <p className="text-sm">{remove.confirmText}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(remove.action, () => {
                  router.push(remove.redirectTo);
                  router.refresh();
                })
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
              {remove.keepLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
