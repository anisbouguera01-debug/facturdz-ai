"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Ouvre la boîte d'impression du navigateur. La mise en page « papier » est gérée en CSS (print:). */
export function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}
