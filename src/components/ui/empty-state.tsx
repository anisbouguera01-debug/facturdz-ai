import { cn } from "@/lib/utils";

/** État vide : une phrase qui dit quoi faire, et l'action pour commencer. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className="mb-3 grid size-11 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
