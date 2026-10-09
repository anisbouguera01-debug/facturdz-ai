import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-input bg-card shadow-card px-3 text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(base, "h-11 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(base, "min-h-24 py-2.5", className)} {...props} />;
}
