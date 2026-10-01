"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createTaxRateAction,
  setTaxRateActiveAction,
  updateTaxRateAction,
} from "@/app/(app)/products/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { formatRate } from "@/lib/money";

interface Rate {
  id: string;
  label: string;
  rate: string;
  isDefault: boolean;
  active: boolean;
}

type Result = { ok: boolean; error?: { message: string; fieldErrors?: Record<string, string[]> } };

function RateFields({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { label: string; rate: string; isDefault: boolean };
  submitLabel: string;
  onSubmit: (v: { label: string; rate: string; isDefault: boolean }) => Promise<Result>;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [rate, setRate] = useState(initial?.rate.replace(".", ",").replace(/,00$/, "") ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [error, setError] = useState<Result["error"] | null>(null);
  const [pending, start] = useTransition();
  const uid = initial ? "edit" : "new";

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await onSubmit({ label, rate, isDefault });
          if (!res.ok) setError(res.error ?? { message: "Enregistrement impossible." });
          else if (!initial) {
            setLabel("");
            setRate("");
            setIsDefault(false);
          }
        });
      }}
    >
      {error ? <FormMessage>{error.message}</FormMessage> : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <div className="grid gap-1.5">
          <label htmlFor={`${uid}-label`} className="text-sm font-medium">
            Libellé
          </label>
          <Input
            id={`${uid}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex. TVA taux normal"
            aria-invalid={error?.fieldErrors?.label ? true : undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${uid}-rate`} className="text-sm font-medium">
            Taux (%)
          </label>
          <Input
            id={`${uid}-rate`}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            className="font-mono"
            aria-invalid={error?.fieldErrors?.rate ? true : undefined}
          />
        </div>
      </div>
      {error?.fieldErrors?.rate ? (
        <p role="alert" className="text-sm text-destructive">
          {error.fieldErrors.rate[0]}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        Taux proposé par défaut pour les nouveaux produits
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function TaxRatesManager({ rates }: { rates: Rate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = (res: Result) => {
    if (res.ok) router.refresh();
    return res;
  };

  return (
    <div className="grid gap-8">
      {error ? <FormMessage>{error}</FormMessage> : null}
      {rates.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun taux pour l&apos;instant. Ajoutez le premier ci-dessous.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rates.map((r) => (
            <li key={r.id} className="px-4 py-3">
              {editing === r.id ? (
                <RateFields
                  initial={r}
                  submitLabel="Enregistrer"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (v) => {
                    const res = done(await updateTaxRateAction(r.id, v));
                    if (res.ok) setEditing(null);
                    return res;
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-16 font-mono tabular-nums">{formatRate(r.rate)}</span>
                    <span className={r.active ? "" : "text-muted-foreground line-through"}>
                      {r.label}
                    </span>
                    {r.isDefault ? <Badge tone="info">Par défaut</Badge> : null}
                    {!r.active ? <Badge>Désactivé</Badge> : null}
                  </div>
                  <div className="flex gap-1">
                    {r.active ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r.id)}>
                        Modifier
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setError(null);
                          const res = done(await setTaxRateActiveAction(r.id, !r.active));
                          if (!res.ok) setError(res.error?.message ?? "Action impossible.");
                        })
                      }
                    >
                      {r.active ? "Désactiver" : "Réactiver"}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="add-rate" className="rounded-lg border p-4 sm:p-5">
        <h2 id="add-rate" className="mb-4 text-base font-semibold">
          Ajouter un taux
        </h2>
        <RateFields
          submitLabel="Ajouter le taux"
          onSubmit={async (v) => done(await createTaxRateAction(v))}
        />
      </section>
    </div>
  );
}
