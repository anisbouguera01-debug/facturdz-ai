"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_LINKS } from "@/components/legal/legal-ui";

/** Liens vers les autres documents légaux (le document courant n'est pas répété). */
export function LegalOtherDocs() {
  const pathname = usePathname();
  const others = LEGAL_LINKS.filter((l) => l.href !== pathname);
  return (
    <nav aria-label="Autres documents légaux">
      <p className="text-sm font-medium">Autres documents</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {others.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-card transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
