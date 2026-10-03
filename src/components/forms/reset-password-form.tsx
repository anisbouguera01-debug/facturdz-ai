"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  if (done) {
    return (
      <div className="grid gap-4">
        <FormMessage tone="info">
          Votre mot de passe a été modifié. Vous pouvez vous connecter.
        </FormMessage>
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Aller à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setFormError(undefined);
        if (password.length < PASSWORD_MIN)
          return setError(`Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`);
        if (password.length > PASSWORD_MAX)
          return setError(`Le mot de passe ne peut pas dépasser ${PASSWORD_MAX} caractères.`);
        if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
        setError(undefined);
        setPending(true);
        const { error: apiError } = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        setPending(false);
        if (apiError) return setFormError(authErrorMessage(apiError, "reset"));
        setDone(true);
      }}
    >
      {formError ? (
        <FormMessage>
          {formError}{" "}
          <Link href="/forgot-password" className="underline">
            Nouvelle demande
          </Link>
        </FormMessage>
      ) : null}
      <Field
        id="password"
        label="Nouveau mot de passe"
        error={error}
        hint={`${PASSWORD_MIN} caractères minimum.`}
      >
        <Input
          {...fieldAria("password", error)}
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field id="confirm" label="Confirmer le mot de passe">
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
