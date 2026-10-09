import { cn } from "@/lib/utils";

/** Carte statistique : libellé, valeur (chiffres alignés), note et icône facultatives. À placer dans un <dl>. */
export function StatCard({
  label,
  value,
  note,
  tone,
  icon,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "danger" | "success";
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hover:shadow-pop rounded-xl border bg-card p-4 shadow-card transition-shadow sm:p-5",
        className,
      )}
    >
      <dt className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {icon ? (
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4"
          >
            {icon}
          </span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "tabular mt-2 text-xl font-semibold tracking-tight sm:text-2xl",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </dd>
      {note ? <dd className="mt-1 text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}
