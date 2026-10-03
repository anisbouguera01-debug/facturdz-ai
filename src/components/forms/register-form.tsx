"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { CheckMailNotice } from "@/components/forms/check-mail-notice";
import { PASSWORD_MIN, registerSchema, type RegisterInput } from "@/lib/validation/auth";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const v = registerSchema.parse(values);
    const { data, error } = await authClient.signUp.email({
      callbackURL: "/verify-email",
      email: v.email,
      password: v.password,
      name: `${v.firstName} ${v.lastName}`,
      firstName: v.firstName,
      lastName: v.lastName,
    });
    if (error) {
      setFormError(authErrorMessage(error, "register"));
      return;
    }
    // Sans session (adresse à confirmer) : on invite à ouvrir le lien reçu par e-mail.
    if (!data?.token) {
      setSentTo(v.email);
      return;
    }
    router.replace("/onboarding");
    router.refresh();
  });

  if (sentTo) return <CheckMailNotice email={sentTo} />;

  const pwHint = `${PASSWORD_MIN} caractères minimum. Une phrase de quelques mots est plus sûre et plus facile à retenir.`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="firstName" label="Prénom" error={errors.firstName?.message}>
          <Input
            {...fieldAria("firstName", errors.firstName?.message)}
            autoComplete="given-name"
            autoFocus
            {...register("firstName")}
          />
        </Field>
        <Field id="lastName" label="Nom" error={errors.lastName?.message}>
          <Input
            {...fieldAria("lastName", errors.lastName?.message)}
            autoComplete="family-name"
            {...register("lastName")}
          />
        </Field>
      </div>

      <Field id="email" label="Adresse e-mail professionnelle" error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          inputMode="email"
          {...register("email")}
        />
      </Field>

      <Field id="password" label="Mot de passe" error={errors.password?.message} hint={pwHint}>
        <Input
          {...fieldAria("password", errors.password?.message, pwHint)}
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
      </Field>

      <p className="text-sm text-muted-foreground">
        En créant un compte, vous acceptez les{" "}
        <Link href="/cgu" className="underline underline-offset-4">
          conditions générales d&apos;utilisation
        </Link>{" "}
        et reconnaissez avoir pris connaissance de la{" "}
        <Link href="/confidentialite" className="underline underline-offset-4">
          politique de confidentialité
        </Link>
        .
      </p>

      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting ? "Création du compte…" : "Créer mon compte"}
      </Button>
    </form>
  );
}
