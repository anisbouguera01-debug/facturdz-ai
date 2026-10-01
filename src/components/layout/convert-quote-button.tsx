"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { convertQuoteAction } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

/** Crée un brouillon de facture à partir d'un devis accepté. */
export function ConvertQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await convertQuoteAction(quoteId);
              if (!res.ok) return setError(res.error.message);
              router.push(`/invoices/${res.data.id}`);
            })
          }
        >
          {pending ? "Création…" : "Créer la facture"}
        </Button>
      </div>
    </div>
  );
}
