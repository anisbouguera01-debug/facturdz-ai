"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { createInvoiceAction, updateInvoiceAction } from "@/app/(app)/invoices/actions";
import { createQuoteAction, updateQuoteAction } from "@/app/(app)/quotes/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select, Textarea } from "@/components/ui/select";
import { computeDocument, lineInputSchema, MAX_LINES, type LineData } from "@/lib/billing";
import { formatAmount, formatMoney } from "@/lib/format";
import { formatRate } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Éditeur de document (devis et factures).
 * Les totaux affichés sont un APERÇU calculé avec le même moteur que le serveur ;
 * le serveur revalide et recalcule tout à l'enregistrement.
 */
export interface EditorLine {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  vatRate: string;
}

export interface EditorValues {
  customerId: string;
  issueDate: string;
  secondDate: string;
  notes: string;
  terms: string;
  items: EditorLine[];
}

interface Option {
  id: string;
  label: string;
}
interface ProductOption {
  id: string;
  name: string;
  unit: string | null;
  priceHT: string;
  vatRate: string;
}
interface RateOption {
  rate: string;
  label: string;
  isDefault: boolean;
}

const KINDS = {
  quote: {
    secondDateLabel: "Valable jusqu'au",
    secondDateKey: "expiryDate",
    create: createQuoteAction,
    update: updateQuoteAction,
    path: "/quotes",
    submit: { create: "Enregistrer le brouillon", update: "Enregistrer les modifications" },
    termsLabel: "Conditions",
    termsPlaceholder: "Ex. délai de livraison, modalités de paiement",
  },
  invoice: {
    secondDateLabel: "Échéance",
    secondDateKey: "dueDate",
    create: createInvoiceAction,
    update: updateInvoiceAction,
    path: "/invoices",
    submit: { create: "Enregistrer le brouillon", update: "Enregistrer les modifications" },
    termsLabel: "Conditions de règlement",
    termsPlaceholder: "Ex. paiement à 30 jours, par virement ou chèque",
  },
} as const;

const toFr = (v: string) =>
  v
    .replace(".", ",")
    .replace(/,0+$/, "")
    .replace(/(,\d*?)0+$/, "$1");

export function DocumentEditor({
  kind,
  documentId,
  defaults,
  customers,
  products,
  rates,
}: {
  kind: keyof typeof KINDS;
  documentId?: string;
  defaults: EditorValues;
  customers: Option[];
  products: ProductOption[];
  rates: RateOption[];
}) {
  const cfg = KINDS[kind];
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const defaultRate = rates.find((r) => r.isDefault)?.rate ?? rates[0]?.rate ?? "";
  const emptyLine = (): EditorLine => ({
    productId: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    discountRate: "",
    vatRate: defaultRate,
  });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<EditorValues>({ defaultValues: defaults });
  const { fields, append, remove, move } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });

  // Taux proposés : ceux de l'entreprise + ceux déjà présents sur les lignes.
  const rateOptions = useMemo(() => {
    const extra = (defaults.items ?? [])
      .map((l) => l.vatRate)
      .filter((r) => r && !rates.some((o) => o.rate === r))
      .map((r) => ({ rate: r, label: "Taux du produit", isDefault: false }));
    return [...rates, ...extra.filter((e, i, a) => a.findIndex((x) => x.rate === e.rate) === i)];
  }, [rates, defaults.items]);

  const preview = useMemo(() => {
    const parsed = (items ?? []).map((l) => lineInputSchema.safeParse(l));
    const valid = parsed.map((p) => (p.success ? p.data : null));
    const totals = computeDocument(valid.filter((v): v is LineData => v !== null));
    let k = 0;
    const lineTotals = valid.map((v) => (v ? totals.lines[k++].subtotal.toFixed(2) : null));
    return { totals, lineTotals };
  }, [items]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    clearErrors();
    const payload = {
      customerId: values.customerId,
      issueDate: values.issueDate,
      [cfg.secondDateKey]: values.secondDate || undefined,
      notes: values.notes,
      terms: values.terms,
      items: values.items.map((l) => ({ ...l, productId: l.productId || undefined })),
    };
    const res = documentId
      ? await cfg.update(documentId, payload as never)
      : await cfg.create(payload as never);
    if (!res.ok) {
      for (const [field, messages] of Object.entries(res.error.fieldErrors ?? {})) {
        const name = field === cfg.secondDateKey ? "secondDate" : field;
        setError(name as FieldPath<EditorValues>, { message: messages[0] });
      }
      setFormError(res.error.message);
      return;
    }
    router.push(`${cfg.path}/${res.data.id}`);
    router.refresh();
  });

  const pickProduct = (index: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setValue(`items.${index}.productId`, productId);
    if (!p) return;
    setValue(`items.${index}.description`, p.unit ? `${p.name} (${p.unit})` : p.name);
    setValue(`items.${index}.unitPrice`, toFr(p.priceHT));
    setValue(`items.${index}.vatRate`, p.vatRate);
  };

  const err = (path: string) =>
    path
      .split(".")
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], errors) as
      { message?: string } | undefined;
  const lineError = (i: number) =>
    (["description", "quantity", "unitPrice", "discountRate", "vatRate", "productId"] as const)
      .map((f) => err(`items.${i}.${f}`)?.message)
      .find(Boolean);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8">
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <section aria-label="En-tête" className="grid gap-5 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-3 lg:col-span-1">
          <label htmlFor="customerId" className="text-sm font-medium">
            Client
          </label>
          <Select
            id="customerId"
            aria-invalid={err("customerId") ? true : undefined}
            {...register("customerId")}
          >
            <option value="">Choisir un client</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          {err("customerId")?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {err("customerId")?.message}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="issueDate" className="text-sm font-medium">
            Date
          </label>
          <Input
            id="issueDate"
            type="date"
            aria-invalid={err("issueDate") ? true : undefined}
            {...register("issueDate")}
          />
          {err("issueDate")?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {err("issueDate")?.message}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="secondDate" className="text-sm font-medium">
            {cfg.secondDateLabel}
          </label>
          <Input
            id="secondDate"
            type="date"
            aria-invalid={err("secondDate") ? true : undefined}
            {...register("secondDate")}
          />
          {err("secondDate")?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {err("secondDate")?.message}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="lines-title" className="grid gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="lines-title" className="text-base font-semibold">
            Lignes
          </h2>
          <p className="text-xs text-muted-foreground">Montants HT, en dinars</p>
        </div>
        {err("items")?.message ? <FormMessage>{err("items")?.message}</FormMessage> : null}

        <div className="hidden grid-cols-[minmax(0,1fr)_84px_128px_76px_120px_120px_40px] gap-2 px-1 text-xs text-muted-foreground lg:grid">
          <span>Désignation</span>
          <span>Quantité</span>
          <span>Prix unitaire</span>
          <span>Remise %</span>
          <span>TVA</span>
          <span className="text-right">Montant HT</span>
          <span />
        </div>

        <ol className="grid gap-3">
          {fields.map((field, i) => {
            const msg = lineError(i);
            const id = (f: string) => `items-${i}-${f}`;
            return (
              <li
                key={field.id}
                className={cn(
                  "grid gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_84px_128px_76px_120px_120px_40px] lg:items-start lg:rounded-none lg:border-0 lg:border-b lg:p-1 lg:pb-3",
                  msg && "border-destructive/40",
                )}
              >
                <div className="grid gap-1.5">
                  {products.length > 0 ? (
                    <Select
                      aria-label={`Ligne ${i + 1} : produit du catalogue`}
                      value={items?.[i]?.productId ?? ""}
                      onChange={(e) => pickProduct(i, e.target.value)}
                      className="h-9 text-sm"
                    >
                      <option value="">Saisie libre</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <label htmlFor={id("description")} className="sr-only">
                    Ligne {i + 1} : désignation
                  </label>
                  <Input
                    id={id("description")}
                    placeholder="Désignation"
                    {...register(`items.${i}.description`)}
                  />
                </div>
                <Labeled id={id("quantity")} label="Quantité">
                  <Input
                    id={id("quantity")}
                    inputMode="decimal"
                    className="font-mono"
                    {...register(`items.${i}.quantity`)}
                  />
                </Labeled>
                <Labeled id={id("unitPrice")} label="Prix unitaire HT">
                  <Input
                    id={id("unitPrice")}
                    inputMode="decimal"
                    className="font-mono"
                    {...register(`items.${i}.unitPrice`)}
                  />
                </Labeled>
                <Labeled id={id("discountRate")} label="Remise %">
                  <Input
                    id={id("discountRate")}
                    inputMode="decimal"
                    placeholder="0"
                    className="font-mono"
                    {...register(`items.${i}.discountRate`)}
                  />
                </Labeled>
                <Labeled id={id("vatRate")} label="TVA">
                  <Select id={id("vatRate")} {...register(`items.${i}.vatRate`)}>
                    {rateOptions.map((r) => (
                      <option key={r.rate} value={r.rate}>
                        {formatRate(r.rate)}
                      </option>
                    ))}
                  </Select>
                </Labeled>
                <div className="flex items-center justify-between gap-2 lg:block lg:pt-2.5 lg:text-right">
                  <span className="text-sm text-muted-foreground lg:hidden">Montant HT</span>
                  <span className="font-mono text-sm tabular-nums">
                    {preview.lineTotals[i] ? formatAmount(preview.lineTotals[i]) : "—"}
                  </span>
                </div>
                <div className="flex gap-1 lg:block">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={fields.length === 1}
                    aria-label={`Supprimer la ligne ${i + 1}`}
                    className="inline-flex h-9 items-center rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 lg:mt-1"
                  >
                    <span className="lg:hidden">Supprimer la ligne</span>
                    <span aria-hidden className="hidden lg:inline">
                      ✕
                    </span>
                  </button>
                  {i > 0 ? (
                    <button
                      type="button"
                      onClick={() => move(i, i - 1)}
                      className="inline-flex h-9 items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted lg:hidden"
                    >
                      Monter
                    </button>
                  ) : null}
                </div>
                {msg ? (
                  <p role="alert" className="text-sm text-destructive lg:col-span-7">
                    Ligne {i + 1} : {msg}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={fields.length >= MAX_LINES}
            onClick={() => append(emptyLine())}
          >
            Ajouter une ligne
          </Button>
        </div>
      </section>

      <section aria-label="Totaux" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-5">
          <div className="grid gap-1.5">
            <label htmlFor="notes" className="text-sm font-medium">
              Notes (imprimées sur le document)
            </label>
            <Textarea id="notes" rows={3} {...register("notes")} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="terms" className="text-sm font-medium">
              {cfg.termsLabel}
            </label>
            <Textarea
              id="terms"
              rows={3}
              placeholder={cfg.termsPlaceholder}
              {...register("terms")}
            />
          </div>
        </div>
        <dl
          aria-live="polite"
          className="grid h-fit grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-lg bg-muted p-4 text-sm"
        >
          {preview.totals.discountTotal.gt(0) ? (
            <>
              <dt className="text-muted-foreground">Total brut HT</dt>
              <dd className="text-right font-mono tabular-nums">
                {formatMoney(preview.totals.grossTotal.toFixed(2))}
              </dd>
              <dt className="text-muted-foreground">Remises</dt>
              <dd className="text-right font-mono tabular-nums">
                −{formatMoney(preview.totals.discountTotal.toFixed(2))}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Total HT</dt>
          <dd className="text-right font-mono tabular-nums">
            {formatMoney(preview.totals.subtotal.toFixed(2))}
          </dd>
          {preview.totals.vatBreakdown.map((v) => (
            <div key={v.rate} className="contents">
              <dt className="text-muted-foreground">TVA {formatRate(v.rate)}</dt>
              <dd className="text-right font-mono tabular-nums">{formatMoney(v.tax.toFixed(2))}</dd>
            </div>
          ))}
          <dt className="border-t border-border pt-2 text-base font-semibold">Total TTC</dt>
          <dd className="border-t border-border pt-2 text-right font-mono text-base font-semibold tabular-nums">
            {formatMoney(preview.totals.total.toFixed(2))}
          </dd>
          <p className="col-span-2 text-xs text-muted-foreground">
            Aperçu ; les montants sont recalculés à l&apos;enregistrement.
          </p>
        </dl>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Enregistrement…" : documentId ? cfg.submit.update : cfg.submit.create}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function Labeled({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 lg:block">
      <label htmlFor={id} className="text-sm text-muted-foreground lg:sr-only">
        {label}
      </label>
      {children}
    </div>
  );
}
