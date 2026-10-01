"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createOrganizationAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import {
  createOrganizationSchema,
  type CreateOrganizationData,
  type CreateOrganizationInput,
} from "@/lib/validation/organization";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput, unknown, CreateOrganizationData>({
    resolver: zodResolver(createOrganizationSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const res = await createOrganizationAction(values);
    if (!res.ok) {
      for (const [field, messages] of Object.entries(res.error.fieldErrors ?? {})) {
        setError(field as keyof CreateOrganizationInput, { message: messages[0] });
      }
      setFormError(res.error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  });

  const e = errors;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Field
        id="name"
        label="Nom de l'entreprise"
        error={e.name?.message}
        hint="Le nom utilisé au quotidien, tel qu'il apparaîtra dans l'application."
      >
        <Input
          {...fieldAria("name", e.name?.message, true)}
          autoComplete="organization"
          autoFocus
          {...register("name")}
        />
      </Field>

      <Field
        id="legalName"
        label="Raison sociale (facultatif)"
        error={e.legalName?.message}
        hint="Exemple : SARL Atlas Informatique. Elle figurera sur vos factures."
      >
        <Input {...fieldAria("legalName", e.legalName?.message, true)} {...register("legalName")} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="wilaya" label="Wilaya (facultatif)" error={e.wilaya?.message}>
          <Input
            {...fieldAria("wilaya", e.wilaya?.message)}
            autoComplete="address-level1"
            {...register("wilaya")}
          />
        </Field>
        <Field id="commune" label="Commune (facultatif)" error={e.commune?.message}>
          <Input
            {...fieldAria("commune", e.commune?.message)}
            autoComplete="address-level2"
            {...register("commune")}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="phone" label="Téléphone (facultatif)" error={e.phone?.message}>
          <Input
            {...fieldAria("phone", e.phone?.message)}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            {...register("phone")}
          />
        </Field>
        <Field id="email" label="E-mail de facturation (facultatif)" error={e.email?.message}>
          <Input
            {...fieldAria("email", e.email?.message)}
            type="email"
            inputMode="email"
            {...register("email")}
          />
        </Field>
      </div>

      <p className="text-sm text-muted-foreground">
        NIF, NIS, registre de commerce et logo se renseignent ensuite dans les paramètres de
        l&apos;entreprise.
      </p>

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-fit">
        {isSubmitting ? "Création…" : "Créer l'entreprise"}
      </Button>
    </form>
  );
}
