"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptQuoteAction,
  deleteQuoteAction,
  duplicateQuoteAction,
  rejectQuoteAction,
  sendQuoteAction,
} from "@/app/(app)/quotes/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { QuoteStatus } from "@/lib/quote-status";

type Result = { ok: boolean; data?: unknown; error?: { message: string } };

/** Actions de statut d'un devis. Le serveur vérifie chaque transition. */
export function QuoteActions({
  id,
  status,
  canWrite,
  canDelete,
}: {
  id: string;
  status: QuoteStatus;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"send" | "delete" | null>(null);

  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      setConfirm(null);
      if (!res.ok) return setError(res.error?.message ?? "Action impossible.");
      if (after) after(res);
      else router.refresh();
    });

  if (!canWrite && !canDelete) return null;

  return (
    <div className="grid gap-3">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div className="flex flex-wrap gap-2">
        {canWrite && status === "DRAFT" ? (
          <>
            <Button
              onClick={() => router.push(`/quotes/${id}/edit`)}
              variant="secondary"
              disabled={pending}
            >
              Modifier
            </Button>
            <Button onClick={() => setConfirm("send")} disabled={pending}>
              Marquer comme envoyé
            </Button>
          </>
        ) : null}
        {canWrite && status === "SENT" ? (
          <>
            <Button onClick={() => run(() => acceptQuoteAction(id))} disabled={pending}>
              Accepté par le client
            </Button>
            <Button
              variant="secondary"
              onClick={() => run(() => rejectQuoteAction(id))}
              disabled={pending}
            >
              Refusé par le client
            </Button>
          </>
        ) : null}
        {canWrite ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () => duplicateQuoteAction(id),
                (r) => router.push(`/quotes/${(r.data as { id: string }).id}`),
              )
            }
          >
            Dupliquer
          </Button>
        ) : null}
        {canDelete && status === "DRAFT" ? (
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm("delete")}>
            Supprimer
          </Button>
        ) : null}
      </div>

      {confirm === "send" ? (
        <div role="alertdialog" aria-label="Confirmer l'envoi" className="rounded-md border p-4">
          <p className="text-sm">
            Le devis reçoit son numéro définitif et ne pourra plus être modifié. Pour changer un
            devis envoyé, il faudra le dupliquer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => sendQuoteAction(id))}>
              {pending ? "Numérotation…" : "Numéroter et marquer envoyé"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>
              Garder en brouillon
            </Button>
          </div>
        </div>
      ) : null}
      {confirm === "delete" ? (
        <div
          role="alertdialog"
          aria-label="Confirmer la suppression"
          className="rounded-md border border-destructive/30 p-4"
        >
          <p className="text-sm">Supprimer définitivement ce brouillon ?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteQuoteAction(id),
                  () => router.push("/quotes"),
                )
              }
            >
              Supprimer le brouillon
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>
              Garder le brouillon
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
