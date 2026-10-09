"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createProductAction, updateProductAction } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select, Textarea } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { formatRate, moneySchema, ttcFromHt, vatAmount } from "@/lib/money";
import {
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  productSchema,
  type ProductData,
  type ProductInput,
} from "@/lib/validation/product";

interface Rate {
  rate: string;
  label: string;
  isDefault: boolean;
}

export function ProductForm({
  productId,
  defaults,
  rates,
}: {
  productId?: string;
  defaults?: Partial<Record<keyof ProductInput, string | null>>;
  rates: Rate[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const defaultRate = rates.find((r) => r.isDefault)?.rate ?? rates[0]?.rate ?? "";
  // Le taux actuel d'un produit reste proposé même s'il a été désactivé depuis.
  const options =
    defaults?.vatRate && !rates.some((r) => r.rate === defaults.vatRate)
      ? [...rates, { rate: defaults.vatRate, label: "Taux actuel (désactivé)", isDefault: false }]
      : rates;

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput, unknown, ProductData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      type: "PRODUCT",
      vatRate: defaultRate,
      ...Object.fromEntries(Object.entries(defaults ?? {}).map(([k, v]) => [k, v ?? ""])),
    } as ProductInput,
  });
  const [price, rate, type] = useWatch({ control, name: ["priceHT", "vatRate", "type"] });
  const parsedPrice = moneySchema.safeParse(price ?? "");
  const preview =
    parsedPrice.success && rate
      ? {
          vat: vatAmount(parsedPrice.data, String(rate)),
          ttc: ttcFromHt(parsedPrice.data, String(rate)),
        }
      : null;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = productId
      ? await updateProductAction(productId, values)
      : await createProductAction(values);
    if (!res.ok) {
      for (const [field, messages] of Object.entries(res.error.fieldErrors ?? {})) {
        setError(field as keyof ProductInput, { message: messages[0] });
      }
      setFormError(res.error.message);
      return;
    }
    router.push(productId ? `/products/${res.data.id}` : "/products");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8">
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <fieldset className="grid gap-5">
        <legend className="sr-only">Type</legend>
        <div className="flex flex-wrap gap-2">
          {PRODUCT_TYPES.map((t) => (
            <label
              key={t}
              className="flex h-10 cursor-pointer items-center rounded-md border border-input px-3 text-sm has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input type="radio" value={t} className="sr-only" {...register("type")} />
              {PRODUCT_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
        <Field id="name" label="Désignation" error={errors.name?.message}>
          <Input
            {...fieldAria("name", errors.name?.message)}
            autoFocus={!productId}
            {...register("name")}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="sku"
            label="Référence interne (facultatif)"
            error={errors.sku?.message}
            hint="Unique dans votre catalogue."
          >
            <Input {...fieldAria("sku", errors.sku?.message, true)} {...register("sku")} />
          </Field>
          <Field
            id="unit"
            label="Unité (facultatif)"
            error={errors.unit?.message}
            hint={
              type === "SERVICE"
                ? "Exemple : heure, jour, forfait."
                : "Exemple : unité, carton, kg."
            }
          >
            <Input {...fieldAria("unit", errors.unit?.message, true)} {...register("unit")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-1 text-base font-semibold">Prix</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="priceHT" label="Prix unitaire HT (DA)" error={errors.priceHT?.message}>
            <Input
              {...fieldAria("priceHT", errors.priceHT?.message)}
              inputMode="decimal"
              autoComplete="off"
              className="tabular"
              {...register("priceHT")}
            />
          </Field>
          <Field id="vatRate" label="TVA" error={errors.vatRate?.message}>
            <Select {...fieldAria("vatRate", errors.vatRate?.message)} {...register("vatRate")}>
              {options.map((r) => (
                <option key={r.rate} value={r.rate}>
                  {r.label} ({formatRate(r.rate)})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div aria-live="polite" className="rounded-md bg-muted px-4 py-3 text-sm">
          {preview ? (
            <dl className="grid grid-cols-[1fr_auto] gap-y-1">
              <dt className="text-muted-foreground">TVA</dt>
              <dd className="tabular text-right">{formatMoney(preview.vat.toFixed(2))}</dd>
              <dt className="font-medium">Prix unitaire TTC</dt>
              <dd className="tabular text-right font-medium">
                {formatMoney(preview.ttc.toFixed(2))}
              </dd>
            </dl>
          ) : (
            <p className="text-muted-foreground">
              Le prix TTC s&apos;affiche dès qu&apos;un prix valide est saisi.
            </p>
          )}
        </div>
      </fieldset>

      <Field id="description" label="Description (facultatif)" error={errors.description?.message}>
        <Textarea
          {...fieldAria("description", errors.description?.message)}
          rows={3}
          {...register("description")}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting
            ? "Enregistrement…"
            : productId
              ? "Enregistrer les modifications"
              : "Ajouter au catalogue"}
        </Button>
        <Link
          href="/products"
          className="inline-flex h-12 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Annuler
        </Link>
      </div>
    </form>
  );
}
