"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { voidPaymentAction } from "@/app/(app)/payments/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";

/** Annule un paiement avec un motif obligatoire (le paiement reste visible, barré). */
export function VoidPaymentButton({
  paymentId,
  invoiceId,
}: {
  paymentId: string;
  invoiceId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Annuler
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-label="Annuler le paiement" className="grid gap-2">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <label htmlFor={`reason-${paymentId}`} className="text-xs text-muted-foreground">
        Motif de l&apos;annulation
      </label>
      <Input
        id={`reason-${paymentId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await voidPaymentAction(paymentId, invoiceId, reason);
              if (!res.ok) {
                setError(res.error.fieldErrors?.reason?.[0] ?? res.error.message);
                return;
              }
              setOpen(false);
              router.refresh();
            })
          }
        >
          Confirmer l&apos;annulation
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Garder
        </Button>
      </div>
    </div>
  );
}
