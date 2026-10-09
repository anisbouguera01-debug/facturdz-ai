import Link from "next/link";
import { Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** Formulaire de filtre (GET, sans JavaScript) : recherche + un filtre de statut facultatif. */
export function AdminFilters({
  action,
  q,
  searchLabel,
  searchPlaceholder,
  select,
  active,
}: {
  action: string;
  q?: string;
  searchLabel: string;
  searchPlaceholder: string;
  select?: {
    name: string;
    label: string;
    value?: string;
    options: { value: string; label: string }[];
  };
  active: boolean;
}) {
  return (
    <form
      method="get"
      role="search"
      className="grid gap-3 rounded-xl border bg-card p-3 shadow-card sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end sm:p-4"
    >
      <div className="grid gap-1.5">
        <label htmlFor="q" className="text-sm font-medium">
          {searchLabel}
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder={searchPlaceholder}
        />
      </div>
      {select ? (
        <div className="grid gap-1.5">
          <label htmlFor={select.name} className="text-sm font-medium">
            {select.label}
          </label>
          <Select id={select.name} name={select.name} defaultValue={select.value ?? ""}>
            <option value="">Tous</option>
            {select.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}
      <div className="flex gap-2">
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          <Search />
          Filtrer
        </button>
        {active ? (
          <Link href={action} className={buttonVariants({ variant: "ghost" })}>
            Effacer
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/** Tableau d'administration : défile dans son cadre sur petit écran, jamais dans la page. */
export function AdminTable({
  caption,
  head,
  empty,
  children,
}: {
  caption: string;
  head: { label: string; align?: "right" }[];
  empty?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className="overflow-x-auto rounded-xl border bg-card shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th
                key={h.label}
                scope="col"
                className={`px-4 py-2.5 font-medium whitespace-nowrap ${h.align === "right" ? "text-right" : ""}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children ?? (
            <tr>
              <td colSpan={head.length} className="px-4 py-6 text-center text-muted-foreground">
                {empty ?? "Aucune donnée."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
