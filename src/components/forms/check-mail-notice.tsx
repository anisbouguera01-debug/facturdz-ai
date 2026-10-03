"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

/** « Vérifiez votre boîte mail » + renvoi du lien de confirmation. */
export function CheckMailNotice({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  return (
    <div className="grid gap-4" role="status">
      <h2 className="text-xl font-semibold">Vérifiez votre boîte mail</h2>
      <p className="text-muted-foreground">
        Nous avons envoyé un lien de confirmation à{" "}
        <strong className="text-foreground">{email}</strong>. Ouvrez-le pour activer votre compte.
        Pensez à regarder les courriers indésirables.
      </p>
      {state === "sent" ? (
        <FormMessage tone="info">Un nouveau lien vient d&apos;être envoyé.</FormMessage>
      ) : null}
      {state === "error" ? <FormMessage>{authErrorMessage(null, "verify")}</FormMessage> : null}
      <Button
        variant="secondary"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          const { error } = await authClient.sendVerificationEmail({
            email,
            callbackURL: "/verify-email",
          });
          setState(error ? "error" : "sent");
        }}
      >
        {state === "sending" ? "Envoi…" : "Renvoyer le lien"}
      </Button>
    </div>
  );
}
