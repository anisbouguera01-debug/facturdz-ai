"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordPaymentAction } from "@/app/(app)/payments/actions";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/validation/payment";

/** Enregistre un paiement. Le serveur contrôle le reste à payer ; ici, simple saisie. */
export function PaymentForm({
  invoiceId,
  remaining,
  today,
}: {
  invoiceId: string;
  remaining: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form
      noValidate
      className="grid gap-4 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const text = (k: string) => String(form.get(k) ?? "");
        start(async () => {
          setFormError(null);
          setErrors({});
          const res = await recordPaymentAction({
            invoiceId,
            amount: text("amount"),
            paymentDate: text("paymentDate"),
            method: text("method") as never,
            reference: text("reference"),
            notes: text("notes"),
          });
          if (!res.ok) {
            const fe: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.error.fieldErrors ?? {})) fe[k] = v[0];
            setErrors(fe);
            setFormError(res.error.message);
            return;
          }
          router.refresh();
        });
      }}
    >
      <h2 className="text-base font-semibold">Enregistrer un paiement</h2>
      {formError ? <FormMessage>{formError}</FormMessage> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="amount"
          label="Montant (DA)"
          error={errors.amount}
          hint={`Reste à payer : ${remaining}`}
        >
          <Input
            {...fieldAria("amount", errors.amount, true)}
            name="amount"
            inputMode="decimal"
            className="font-mono"
          />
        </Field>
        <Field id="paymentDate" label="Date" error={errors.paymentDate}>
          <Input
            {...fieldAria("paymentDate", errors.paymentDate)}
            name="paymentDate"
            type="date"
            defaultValue={today}
            max={today}
          />
        </Field>
        <Field id="method" label="Mode de paiement" error={errors.method}>
          <Select
            {...fieldAria("method", errors.method)}
            name="method"
            defaultValue="BANK_TRANSFER"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="reference"
          label="Référence (n° de chèque, de virement…)"
          error={errors.reference}
        >
          <Input {...fieldAria("reference", errors.reference)} name="reference" />
        </Field>
        <Field id="notes" label="Note" error={errors.notes}>
          <Input {...fieldAria("notes", errors.notes)} name="notes" />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le paiement"}
        </Button>
      </div>
    </form>
  );
}
