import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pagination par liens (fonctionne sans JavaScript, partageable par URL).
 * Conserve les autres paramètres de recherche.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageCount,
  total,
  label,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  total: number;
  label: string;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const linkClass =
    "inline-flex h-9 items-center rounded-md border border-input px-3 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <nav aria-label={`Pagination des ${label}`} className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Page {page} sur {pageCount} ({total} {label})
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkClass} rel="prev">
            Précédente
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-50")}>Précédente</span>
        )}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={linkClass} rel="next">
            Suivante
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-50")}>Suivante</span>
        )}
      </div>
    </nav>
  );
}
