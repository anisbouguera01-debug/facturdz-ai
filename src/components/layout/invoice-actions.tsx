"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelInvoiceAction,
  deleteInvoiceAction,
  issueInvoiceAction,
} from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { InvoiceStatus } from "@/lib/invoice-status";

type Result = { ok: boolean; data?: unknown; error?: { message: string } };

/** Actions d'une facture. Le serveur revérifie permission, statut et paiements. */
export function InvoiceActions({
  id,
  status,
  hasPayments,
  canUpdate,
  canIssue,
  canCancel,
  canDelete,
}: {
  id: string;
  status: InvoiceStatus;
  hasPayments: boolean;
  canUpdate: boolean;
  canIssue: boolean;
  canCancel: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"issue" | "cancel" | "delete" | null>(null);

  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      setConfirm(null);
      if (!res.ok) return setError(res.error?.message ?? "Action impossible.");
      if (after) after();
      else router.refresh();
    });

  const isDraft = status === "DRAFT";
  const showCancel = canCancel && status === "ISSUED" && !hasPayments;
  if (!(isDraft && (canUpdate || canIssue || canDelete)) && !showCancel) return null;

  return (
    <div className="grid gap-3">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div className="flex flex-wrap gap-2">
        {isDraft && canUpdate ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => router.push(`/invoices/${id}/edit`)}
          >
            Modifier
          </Button>
        ) : null}
        {isDraft && canIssue ? (
          <Button disabled={pending} onClick={() => setConfirm("issue")}>
            Émettre la facture
          </Button>
        ) : null}
        {isDraft && canDelete ? (
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm("delete")}>
            Supprimer
          </Button>
        ) : null}
        {showCancel ? (
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm("cancel")}>
            Annuler la facture
          </Button>
        ) : null}
      </div>

      {confirm === "issue" ? (
        <div role="alertdialog" aria-label="Confirmer l'émission" className="rounded-md border p-4">
          <p className="text-sm">
            La facture reçoit son numéro définitif, les coordonnées de l&apos;entreprise et du
            client sont figées et elle ne pourra plus être modifiée ni supprimée, seulement annulée.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => issueInvoiceAction(id))}>
              {pending ? "Numérotation…" : "Numéroter et émettre"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>
              Garder en brouillon
            </Button>
          </div>
        </div>
      ) : null}
      {confirm === "cancel" ? (
        <div
          role="alertdialog"
          aria-label="Confirmer l'annulation"
          className="rounded-md border border-destructive/30 p-4"
        >
          <p className="text-sm">
            La facture reste consultable avec son numéro, marquée « Annulée ». Cette action est
            définitive.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => cancelInvoiceAction(id))}
            >
              Annuler la facture
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>
              Conserver la facture
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
                  () => deleteInvoiceAction(id),
                  () => router.push("/invoices"),
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
