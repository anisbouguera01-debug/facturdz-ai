"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { askAssistantAction, proposeDocumentAction } from "@/app/(app)/ai/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Textarea } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Mode = "invoice" | "quote" | "question";

const MODES: { id: Mode; label: string; placeholder: string; submit: string }[] = [
  {
    id: "invoice",
    label: "Créer une facture",
    placeholder: "Ex. : Crée une facture pour Société Atlas avec 3 ordinateurs à 85000 DA",
    submit: "Préparer la facture",
  },
  {
    id: "quote",
    label: "Créer un devis",
    placeholder: "Ex. : Crée un devis pour Société Atlas avec 10 chaises à 12000 DA",
    submit: "Préparer le devis",
  },
  {
    id: "question",
    label: "Poser une question",
    placeholder: "Ex. : Quels clients ont des factures impayées ?",
    submit: "Poser la question",
  },
];

interface Source {
  tool: string;
  args: unknown;
  result: unknown;
}

export function AiAssistant({
  canAsk,
  canInvoice,
  canQuote,
}: {
  canAsk: boolean;
  canInvoice: boolean;
  canQuote: boolean;
}) {
  const router = useRouter();
  const modes = MODES.filter(
    (m) =>
      (m.id === "invoice" && canInvoice) ||
      (m.id === "quote" && canQuote) ||
      (m.id === "question" && canAsk),
  );
  const [mode, setMode] = useState<Mode>(modes[0]?.id ?? "question");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string; sources: Source[] } | null>(null);
  const [pending, start] = useTransition();
  const current = MODES.find((m) => m.id === mode)!;

  const submit = () =>
    start(async () => {
      setError(null);
      setAnswer(null);
      if (mode === "question") {
        const res = await askAssistantAction(text);
        if (!res.ok) return setError(res.error.message);
        setAnswer({ text: res.data.answer, sources: res.data.sources as Source[] });
        return;
      }
      const res = await proposeDocumentAction(mode, text);
      if (!res.ok) return setError(res.error.message);
      router.push(`/ai?draft=${res.data.id}`);
    });

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Que voulez-vous faire ?" className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <button
            key={m.id}
            role="tab"
            type="button"
            aria-selected={m.id === mode}
            onClick={() => {
              setMode(m.id);
              setError(null);
              setAnswer(null);
            }}
            className={cn(
              "h-10 rounded-md border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              m.id === mode
                ? "border-primary bg-accent font-medium"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <label htmlFor="ai-text" className="sr-only">
        {current.label}
      </label>
      <Textarea
        id="ai-text"
        value={text}
        maxLength={mode === "question" ? 500 : 1000}
        placeholder={current.placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
      <div>
        <Button disabled={pending || text.trim().length < 3} onClick={submit}>
          {pending ? "Analyse en cours…" : current.submit}
        </Button>
      </div>
      {mode !== "question" ? (
        <p className="text-xs text-muted-foreground">
          Rien n&apos;est enregistré tant que vous n&apos;avez pas confirmé l&apos;aperçu. Le
          document créé reste un brouillon.
        </p>
      ) : null}
      {answer ? (
        <section aria-label="Réponse" className="grid gap-3 rounded-lg border p-4">
          <p className="text-sm whitespace-pre-line">{answer.text}</p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Données utilisées pour répondre</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap">
              {JSON.stringify(answer.sources, null, 2)}
            </pre>
          </details>
          <p className="text-xs text-muted-foreground">
            Vérifiez les chiffres dans les données ci-dessus : seul le serveur les calcule.
          </p>
        </section>
      ) : null}
    </div>
  );
}
