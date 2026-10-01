import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/taxes", label: "TVA" },
  { href: "/settings/subscription", label: "Abonnement" },
] as const;

/** Sous-navigation des paramètres (chaque phase y ajoute sa section). */
export function SettingsTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Paramètres" className="mb-6 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={cn(
            "h-9 rounded-md border px-3 text-sm leading-9 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            t.href === current
              ? "border-primary bg-accent font-medium"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
