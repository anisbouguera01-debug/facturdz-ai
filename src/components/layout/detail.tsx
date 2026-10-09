import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Conventions communes des pages détail (devis, facture, client, produit) :
 * lien de retour, titre + badges, sous-titre, actions à droite (la principale en dernier),
 * puis une colonne principale et une colonne latérale.
 */
export function DetailHeader({
  backHref,
  backLabel,
  title,
  badges,
  subtitle,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: React.ReactNode;
  badges?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="print:hidden">
      <Link
        href={backHref}
        className="-ml-1 inline-flex items-center gap-0.5 rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {backLabel}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance break-words sm:text-3xl">
              {title}
            </h1>
            {badges}
          </div>
          {subtitle ? <div className="mt-1.5 text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Mise en page deux colonnes : contenu principal à gauche, informations à droite (empilées sur mobile). */
export function DetailLayout({
  main,
  aside,
  className,
}: {
  main: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-6 grid grid-cols-[minmax(0,1fr)] gap-6",
        aside ? "lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start" : "",
        className,
      )}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">{main}</div>
      {aside ? (
        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 print:hidden">{aside}</aside>
      ) : null}
    </div>
  );
}

/** Carte titrée. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} action={action} />
      <div className="px-4 pt-3 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </Card>
  );
}

/** Liste de couples libellé / valeur ; les valeurs absentes affichent « — ». */
export function InfoList({
  items,
  mono,
}: {
  items: { label: string; value: React.ReactNode | null | undefined; mono?: boolean }[];
  mono?: boolean;
}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2.5 text-sm">
      {items.map(({ label, value, mono: m }) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className={cn("break-words", (m ?? mono) && "tabular")}>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
