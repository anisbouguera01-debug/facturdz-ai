"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Demande de réinitialisation. Le message affiché est TOUJOURS le même, que l'adresse existe ou
 * non (pas d'énumération de comptes).
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  if (done) {
    return (
      <div className="grid gap-3">
        <FormMessage tone="info">
          Si un compte existe avec cette adresse, un e-mail contenant un lien de réinitialisation
          vient d&apos;être envoyé. Le lien est valable 1 heure.
        </FormMessage>
        <p className="text-sm text-muted-foreground">
          Pensez à regarder les courriers indésirables.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = loginSchema.shape.email.safeParse(email);
        if (!parsed.success) return setError(parsed.error.issues[0]?.message);
        setError(undefined);
        setPending(true);
        const { error: apiError } = await authClient.requestPasswordReset({
          email: parsed.data,
          redirectTo: "/reset-password",
        });
        setPending(false);
        // Limite de débit : seul cas où l'on distingue (information non sensible).
        if (apiError?.status === 429)
          return setError("Trop de demandes. Patientez quelques minutes avant de réessayer.");
        setDone(true);
      }}
    >
      <Field id="email" label="Adresse e-mail" error={error}>
        <Input
          {...fieldAria("email", error)}
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Envoi…" : "Envoyer le lien"}
      </Button>
    </form>
  );
}
