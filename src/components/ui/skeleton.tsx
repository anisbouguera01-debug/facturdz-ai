import { cn } from "@/lib/utils";

/** Bloc de chargement : discret, sans animation si l'utilisateur la désactive. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
