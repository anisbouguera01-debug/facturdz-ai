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
import { safeRedirect } from "@/lib/safe-redirect";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { email, password } = loginSchema.parse(values);
    // callbackURL : où mène le lien de confirmation renvoyé si l'adresse n'est pas vérifiée.
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/verify-email",
    });
    if (error) {
      setFormError(authErrorMessage(error, "login"));
      return;
    }
    router.replace(safeRedirect(next));
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Field id="email" label="Adresse e-mail" error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          {...register("email")}
        />
      </Field>

      <Field id="password" label="Mot de passe" error={errors.password?.message}>
        <Input
          {...fieldAria("password", errors.password?.message)}
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
      </Field>

      <p className="-mt-2 text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </p>

      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-1 w-full">
        {isSubmitting ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
