"use client";

import {
  FileSignature,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  invoices: FileText,
  payments: Wallet,
  quotes: FileSignature,
  customers: Users,
  products: Package,
  ai: Sparkles,
  settings: Settings,
  admin: ShieldCheck,
} satisfies Record<string, LucideIcon>;

export type NavIcon = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Titre du groupe auquel appartient l'entrée (les entrées consécutives sont regroupées). */
  group?: string;
}

/**
 * Navigation principale. N'affiche que les sections réellement disponibles et autorisées :
 * chaque entrée vient de NAV_ITEMS (src/app/(app)/layout.tsx).
 */
export function AppNav({
  items,
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const groups: { title?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.title === item.group) last.items.push(item);
    else groups.push({ title: item.group, items: [item] });
  }

  return (
    <nav aria-label="Navigation principale" className="grid gap-4">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && !collapsed ? (
            <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">{g.title}</p>
          ) : gi > 0 ? (
            <div className="mx-3 mb-2 border-t" aria-hidden />
          ) : null}
          <ul className="grid gap-0.5">
            {g.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 lg:h-10",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-highlight"
                      />
                    ) : null}
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-[18px] shrink-0 transition-colors",
                        active ? "text-highlight" : "group-hover:text-foreground",
                      )}
                    />
                    <span className={cn(collapsed && "sr-only")}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
