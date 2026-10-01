"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createCustomerAction, updateCustomerAction } from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/select";
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  customerSchema,
  type CustomerData,
  type CustomerInput,
} from "@/lib/validation/customer";

type Defaults = Partial<Record<keyof CustomerInput, string | null>>;

export function CustomerForm({
  customerId,
  defaults,
}: {
  customerId?: string;
  defaults?: Defaults;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerSchema),
    defaultValues: Object.fromEntries(
      Object.entries({ type: "COMPANY", ...defaults }).map(([k, v]) => [k, v ?? ""]),
    ) as CustomerInput,
  });
  const type = useWatch({ control, name: "type" });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = customerId
      ? await updateCustomerAction(customerId, values)
      : await createCustomerAction(values);
    if (!res.ok) {
      for (const [field, messages] of Object.entries(res.error.fieldErrors ?? {})) {
        setError(field as keyof CustomerInput, { message: messages[0] });
      }
      setFormError(res.error.message);
      return;
    }
    router.push(`/customers/${res.data.id}`);
    router.refresh();
  });

  const text = (
    name: keyof CustomerInput,
    label: string,
    props: React.ComponentProps<"input"> = {},
  ) => (
    <Field id={name} label={label} error={errors[name]?.message}>
      <Input {...fieldAria(name, errors[name]?.message)} {...props} {...register(name)} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8">
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <fieldset className="grid gap-5">
        <legend className="mb-1 text-base font-semibold">Identité</legend>
        <div role="radiogroup" aria-label="Type de client" className="flex flex-wrap gap-2">
          {CUSTOMER_TYPES.map((t) => (
            <label
              key={t}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input type="radio" value={t} className="sr-only" {...register("type")} />
              {CUSTOMER_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
        {text("name", type === "INDIVIDUAL" ? "Nom et prénom" : "Nom du client", {
          autoFocus: !customerId,
        })}
        {type === "COMPANY" ? text("companyName", "Raison sociale (facultatif)") : null}
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-1 text-base font-semibold">Coordonnées</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {text("email", "E-mail", { type: "email", inputMode: "email" })}
          {text("phone", "Téléphone", { type: "tel", inputMode: "tel" })}
        </div>
        {text("address", "Adresse")}
        <div className="grid gap-5 sm:grid-cols-2">
          {text("wilaya", "Wilaya")}
          {text("commune", "Commune")}
        </div>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-1 text-base font-semibold">Informations légales</legend>
        <p className="-mt-3 text-sm text-muted-foreground">
          Reprises sur les factures adressées à ce client. Toutes facultatives.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {text("nif", "NIF")}
          {text("nis", "NIS")}
          {text("rc", "Registre de commerce")}
          {text("articleImposition", "Article d'imposition")}
        </div>
      </fieldset>

      <Field
        id="notes"
        label="Notes internes"
        error={errors.notes?.message}
        hint="Jamais imprimées sur les documents."
      >
        <Textarea
          {...fieldAria("notes", errors.notes?.message, true)}
          rows={3}
          {...register("notes")}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting
            ? "Enregistrement…"
            : customerId
              ? "Enregistrer les modifications"
              : "Créer le client"}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
