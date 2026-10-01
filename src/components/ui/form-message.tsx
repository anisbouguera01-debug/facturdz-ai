import { cn } from "@/lib/utils";

/** Message de formulaire (erreur globale ou information). */
export function FormMessage({
  tone = "error",
  children,
  className,
}: {
  tone?: "error" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2.5 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
