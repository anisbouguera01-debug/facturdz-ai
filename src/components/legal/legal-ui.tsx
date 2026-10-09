import { Children, isValidElement } from "react";
import Link from "next/link";
import { LEGAL, LEGAL_DRAFT_DATE, LEGAL_LABELS, type LegalKey } from "@/lib/legal-config";

/** Avertissement affiché en tête de chaque page légale. */
export function DraftNotice() {
  return (
    <aside role="note" className="rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
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

/** Identifiant d'ancre stable à partir d'un titre (sans accents ni ponctuation). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const textOf = (node: React.ReactNode): string =>
  Children.toArray(node)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
    .join("");

/** Titre de section : l'ancre (id) est dérivée du texte ; le sommaire la reprend automatiquement. */
export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      id={slugify(textOf(children))}
      className="mt-10 scroll-mt-24 text-xl font-semibold tracking-tight text-balance first:mt-0"
    >
      {children}
    </h2>
  );
}

function collectHeadings(node: React.ReactNode, out: { id: string; title: string }[]) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { children?: React.ReactNode };
    if (child.type === H2) {
      const title = textOf(props.children);
      out.push({ id: slugify(title), title });
      return;
    }
    collectHeadings(props.children, out);
  });
}

/**
 * Document légal : titre, sommaire généré à partir des <H2> du contenu (aucune liste à tenir à
 * jour), largeur de lecture confortable. Sommaire latéral fixe sur grand écran, repliable sur mobile.
 */
export function LegalDocument({ title, children }: { title: string; children: React.ReactNode }) {
  const headings: { id: string; title: string }[] = [];
  collectHeadings(children, headings);
  const toc = (
    <ol className="grid gap-1 text-sm">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            className="block rounded-md px-2 py-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {h.title}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
      {headings.length > 2 ? (
        <nav aria-label="Sommaire" className="lg:order-first">
          <details className="rounded-xl border bg-card px-4 py-2 shadow-card lg:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
              Sommaire
            </summary>
            <div className="pb-2">{toc}</div>
          </details>
          <div className="sticky top-20 hidden lg:block">
            <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">Sommaire</p>
            {toc}
          </div>
        </nav>
      ) : (
        <div className="hidden lg:block" />
      )}
      <article className="max-w-[46rem] min-w-0 lg:col-start-2 lg:row-start-1">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </article>
    </div>
  );
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
