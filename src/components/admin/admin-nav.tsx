"use client";

import { BadgeDollarSign, Building2, Gauge, Layers, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/admin", label: "Vue d'ensemble", icon: Gauge, exact: true },
  { href: "/admin/organizations", label: "Entreprises", icon: Building2 },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/plans", label: "Plans et limites", icon: Layers },
  { href: "/admin/pricing", label: "Tarifs IA", icon: BadgeDollarSign },
];

/** Navigation de l'administration : la page courante est signalée (couleur + aria-current). */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1">
        {LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
