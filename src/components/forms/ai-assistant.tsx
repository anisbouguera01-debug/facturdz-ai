"use client";

import {
  FileSignature,
  FileText,
  MessageCircleQuestion,
  RotateCcw,
  SendHorizontal,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { askAssistantAction, proposeDocumentAction } from "@/app/(app)/ai/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/lib/utils";

type Mode = "invoice" | "quote" | "question";

/**
 * Les suggestions correspondent à ce que l'assistant sait réellement faire : chiffres de période,
 * clients avec impayés, factures en retard, meilleurs clients (questions), et préparation d'un
 * brouillon de facture ou de devis (créations).
 */
const MODES: {
  id: Mode;
  label: string;
  icon: typeof FileText;
  placeholder: string;
  submit: string;
  suggestions: string[];
}[] = [
  {
    id: "invoice",
    label: "Créer une facture",
    icon: FileText,
    placeholder: "Ex. : Crée une facture pour Société Atlas avec 3 ordinateurs à 85000 DA",
    submit: "Préparer la facture",
    suggestions: ["Crée une facture pour Société Atlas avec 3 ordinateurs à 85000 DA"],
  },
  {
    id: "quote",
    label: "Créer un devis",
    icon: FileSignature,
    placeholder: "Ex. : Crée un devis pour Société Atlas avec 10 chaises à 12000 DA",
    submit: "Préparer le devis",
    suggestions: ["Crée un devis pour Société Atlas avec 10 chaises à 12000 DA"],
  },
  {
    id: "question",
    label: "Poser une question",
    icon: MessageCircleQuestion,
    placeholder: "Ex. : Quels clients ont des factures impayées ?",
    submit: "Poser la question",
    suggestions: [
      "Résume mes factures impayées.",
      "Quels clients ont le plus d'impayés ?",
      "Analyse mon chiffre d'affaires du mois.",
      "Quelles factures sont en retard ?",
    ],
  },
];

interface Source {
  tool: string;
  args: unknown;
  result: unknown;
}

/**
 * Mise en forme des réponses longues, sans HTML brut : paragraphes séparés par une ligne vide,
 * listes à puces (« - », « * », « • ») et listes numérotées (« 1. », « 1) »). Le texte reste du
 * texte : rien n'est interprété comme du code ou du balisage.
 */
function FormattedAnswer({ text }: { text: string }) {
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .map((b) => b.split("\n").filter((l) => l.trim() !== ""));
  return (
    <div className="grid gap-3 text-sm leading-relaxed">
      {blocks.map((lines, i) => {
        const bullets = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (lines.length > 0 && (bullets || numbered)) {
          const List = numbered ? "ol" : "ul";
          return (
            <List
              key={i}
              className={cn("grid gap-1.5 pl-5", numbered ? "list-decimal" : "list-disc")}
            >
              {lines.map((l, j) => (
                <li key={j} className="pl-1 marker:text-muted-foreground">
                  {l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {lines.join("\n")}
          </p>
        );
      })}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-highlight text-primary-foreground [&_svg]:size-4"
    >
      <Sparkles />
    </span>
  );
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
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string; sources: Source[] } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);
  const current = MODES.find((m) => m.id === mode)!;
  const ready = !pending && text.trim().length >= 3;
  // Dernière demande envoyée : permet de réessayer après une erreur sans retaper le texte.
  const [last, setLast] = useState<{ mode: Mode; text: string } | null>(null);

  const send = (sentMode: Mode, sent: string) => {
    setLast({ mode: sentMode, text: sent });
    start(async () => {
      setError(null);
      setAnswer(null);
      setAsked(sentMode === "question" ? sent : null);
      try {
        if (sentMode === "question") {
          const res = await askAssistantAction(sent);
          if (!res.ok) return setError(res.error.message);
          setAnswer({ text: res.data.answer, sources: res.data.sources as Source[] });
          setText("");
          return;
        }
        const res = await proposeDocumentAction(sentMode, sent);
        if (!res.ok) return setError(res.error.message);
        router.push(`/ai?draft=${res.data.id}`);
      } catch {
        // Réseau coupé, délai dépassé, erreur serveur inattendue : on ne laisse pas l'écran muet.
        setError("La connexion a échoué. Vérifiez votre réseau puis réessayez.");
      }
    });
  };
  const submit = () => {
    if (ready) send(mode, text);
  };

  return (
    <div className="grid gap-4">
      <div
        role="tablist"
        aria-label="Que voulez-vous faire ?"
        className="flex w-full flex-wrap gap-1 rounded-xl border bg-muted p-1 sm:w-fit"
      >
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              role="tab"
              type="button"
              aria-selected={m.id === mode}
              onClick={() => {
                setMode(m.id);
                setError(null);
                setAnswer(null);
                setAsked(null);
              }}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm whitespace-nowrap transition-colors",
                m.id === mode
                  ? "bg-card font-medium text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {m.label}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {mode === "question" ? "Essayez par exemple :" : "Exemple de formulation :"}
        </p>
        <ul className="flex flex-wrap gap-2">
          {current.suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  setText(s);
                  input.current?.focus();
                }}
                className="rounded-full border bg-card px-3.5 py-2 text-left text-sm shadow-card transition-colors hover:border-highlight/50 hover:bg-accent"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {asked ? (
        <div className="animate-fade-in flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            {asked}
          </p>
        </div>
      ) : null}

      <div aria-live="polite">
        {pending ? (
          <div className="animate-fade-in flex items-center gap-3">
            <AssistantAvatar />
            <p className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm text-muted-foreground shadow-card">
              <span>Analyse en cours</span>
              <span aria-hidden className="inline-flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-bounce rounded-full bg-highlight motion-reduce:animate-none"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </span>
            </p>
          </div>
        ) : null}
        {answer ? (
          <section aria-label="Réponse" className="animate-fade-in flex items-start gap-3">
            <AssistantAvatar />
            <div className="grid min-w-0 flex-1 gap-3 rounded-2xl rounded-tl-md border bg-card p-4 shadow-card">
              <FormattedAnswer text={answer.text} />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Données utilisées pour répondre</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-2 whitespace-pre-wrap">
                  {JSON.stringify(answer.sources, null, 2)}
                </pre>
              </details>
              <p className="text-xs text-muted-foreground">
                Vérifiez les chiffres dans les données ci-dessus : seul le serveur les calcule.
              </p>
            </div>
          </section>
        ) : null}
      </div>

      {error ? (
        <div className="grid gap-2">
          <FormMessage>{error}</FormMessage>
          {last && !pending ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() => send(last.mode, last.text)}
            >
              <RotateCcw />
              Réessayer
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="shadow-pop sticky bottom-3 z-10 scroll-mb-4 rounded-2xl border bg-card p-2 focus-within:border-highlight focus-within:ring-2 focus-within:ring-ring/20 sm:static sm:shadow-card">
        <label htmlFor="ai-text" className="sr-only">
          {current.label}
        </label>
        <textarea
          id="ai-text"
          ref={input}
          rows={3}
          value={text}
          maxLength={mode === "question" ? 500 : 1000}
          placeholder={current.placeholder}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            // Clavier mobile : garde la zone de saisie visible au-dessus du clavier.
            const el = e.currentTarget;
            setTimeout(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="block w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground/70 sm:text-sm"
        />
        <div className="flex items-center justify-between gap-3 px-1 pt-1">
          <p className="text-xs text-muted-foreground">
            {mode === "question"
              ? "L'assistant lit vos chiffres, il ne modifie rien."
              : "Rien n'est enregistré avant votre confirmation ; le document reste un brouillon."}
            <span className="hidden sm:inline"> Ctrl + Entrée pour envoyer.</span>
          </p>
          <Button disabled={!ready} onClick={submit} size="sm" aria-label={current.submit}>
            <SendHorizontal />
            <span className="max-sm:sr-only">{pending ? "Analyse…" : current.submit}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
