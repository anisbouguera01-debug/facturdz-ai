import { cn } from "@/lib/utils";

/**
 * Logo FacturDZ AI — conservé à l'identique : mot-symbole « FacturDZ » suivi de « AI » dans la
 * couleur de marque d'origine (--brand). Ne pas modifier sans décision explicite.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      FacturDZ <span className="text-brand">AI</span>
    </span>
  );
}
