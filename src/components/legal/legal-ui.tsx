import Link from "next/link";
import { LEGAL, LEGAL_DRAFT_DATE, LEGAL_LABELS, type LegalKey } from "@/lib/legal-config";

/** Avertissement affiché en tête de chaque page légale. */
export function DraftNotice() {
  return (
    <aside role="note" className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
      <p className="font-semibold">Document type, non validé juridiquement</p>
      <p className="mt-1 text-muted-foreground">
        Ce texte est un modèle rédigé de bonne foi à partir du fonctionnement réel de
        l&apos;application. Il doit être relu, adapté et validé par un juriste avant toute
        commercialisation. Les champs « À COMPLÉTER » correspondent à des informations que seul
        l&apos;éditeur peut fournir. Dernière version du modèle : {LEGAL_DRAFT_DATE}.
      </p>
    </aside>
  );
}

/** Valeur juridique de l'éditeur ; si absente, un repère visible « À COMPLÉTER ». */
export function Legal({ k }: { k: LegalKey }) {
  const value = LEGAL[k]?.trim();
  if (value) return <>{value}</>;
  return (
    <mark className="rounded bg-warning/25 px-1 text-foreground">
      [À COMPLÉTER : {LEGAL_LABELS[k]}]
    </mark>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-xl font-semibold tracking-tight">{children}</h2>;
}
export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed text-muted-foreground">{children}</p>;
}
export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">{children}</ul>;
}

export const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/cgu", label: "Conditions générales d'utilisation" },
  { href: "/confidentialite", label: "Politique de confidentialité" },
];

export function LegalNav() {
  return (
    <nav aria-label="Documents légaux" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {LEGAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="underline-offset-4 hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
