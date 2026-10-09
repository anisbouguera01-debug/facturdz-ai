import { cn } from "@/lib/utils";

/** Message de formulaire (erreur globale ou information). */
export function FormMessage({
  tone = "error",
  children,
  className,
}: {
  tone?: "error" | "info" | "success" | "warning";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3.5 py-3 text-sm",
        tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        tone === "info" && "border-border bg-muted text-foreground",
        tone === "success" && "border-success/30 bg-success/8 text-success",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        className,
      )}
    >
      {children}
    </div>
  );
}
