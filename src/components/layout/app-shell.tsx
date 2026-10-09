"use client";

import { Building2, Menu, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppNav, type NavItem } from "@/components/layout/app-nav";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const KEY = "facturdz.sidebar";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === "collapsed";
  } catch {
    return false;
  }
};
function useCollapsed() {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => false,
  );
  const set = (next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "collapsed" : "expanded");
    } catch {
      /* stockage indisponible : le réglage vaut pour cette visite seulement */
    }
    listeners.forEach((l) => l());
  };
  return [value, set] as const;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function Profile({
  user,
  roleLabel,
  compact,
}: {
  user: { name: string; email: string };
  roleLabel: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3", compact && "justify-center")}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
      >
        {initials(user.name || user.email)}
      </span>
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium">{user.name || user.email}</span>
          <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
        </span>
      )}
    </div>
  );
}

/**
 * Structure de l'application : barre latérale repliable (ordinateur) et tiroir tactile (mobile).
 * Les contenus dépendant du serveur (sélecteur d'entreprise, navigation filtrée par rôle) arrivent en props.
 */
export function AppShell({
  items,
  switcher,
  organizationName,
  user,
  roleLabel,
  children,
}: {
  items: NavItem[];
  switcher: React.ReactNode;
  organizationName: string;
  user: { name: string; email: string };
  roleLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useCollapsed();
  // Tiroir ouvert seulement pour la page où on l'a ouvert : il se ferme seul après navigation.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const drawerOpen = openedOn === pathname;
  const drawer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = drawer.current;
    if (!el) return;
    if (drawerOpen && !el.open) el.showModal();
    if (!drawerOpen && el.open) el.close();
  }, [drawerOpen]);

  const addCompany = (
    <Link
      href="/onboarding?nouvelle=1"
      title="Ajouter une entreprise"
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Plus className="size-[18px] shrink-0" aria-hidden />
      <span className={cn(collapsed && "sr-only")}>Ajouter une entreprise</span>
    </Link>
  );

  return (
    <div className="min-h-dvh">
      {/* Barre latérale (ordinateur) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-paper py-4 transition-[width] duration-200 lg:flex print:hidden",
          collapsed ? "w-[76px] px-2" : "w-[264px] px-3",
        )}
      >
        <div
          className={cn("flex items-center", collapsed ? "justify-center" : "justify-between px-3")}
        >
          {collapsed ? (
            <Link
              href="/dashboard"
              aria-label="FacturDZ AI — tableau de bord"
              className="text-lg font-semibold"
            >
              F<span className="text-brand">AI</span>
            </Link>
          ) : (
            <Link href="/dashboard" aria-label="FacturDZ AI — tableau de bord">
              <Logo className="text-lg" />
            </Link>
          )}
          {collapsed ? null : (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Réduire la barre latérale"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Agrandir la barre latérale"
            className="mx-auto mt-3 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeftOpen className="size-4" aria-hidden />
          </button>
        ) : null}

        <div
          className={cn(
            "mt-5",
            collapsed ? "flex justify-center" : "rounded-xl border bg-card p-3 shadow-card",
          )}
        >
          {collapsed ? (
            <span
              title={organizationName}
              className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"
            >
              <Building2 className="size-4" aria-hidden />
              <span className="sr-only">{organizationName}</span>
            </span>
          ) : (
            switcher
          )}
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          <AppNav items={items} collapsed={collapsed} />
        </div>

        <div className="grid gap-1 border-t pt-3">
          {addCompany}
          <div
            className={cn(
              "flex items-center gap-1 px-1 pt-2",
              collapsed ? "flex-col" : "justify-between",
            )}
          >
            <Profile user={user} roleLabel={roleLabel} compact={collapsed} />
            <SignOutButton iconOnly />
          </div>
        </div>
      </aside>

      {/* Barre supérieure (mobile et tablette) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-2.5 backdrop-blur lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpenedOn(pathname)}
          aria-label="Ouvrir le menu"
          aria-haspopup="dialog"
          className="grid size-11 place-items-center rounded-xl border bg-card shadow-card transition-colors active:bg-muted"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/dashboard" aria-label="FacturDZ AI — tableau de bord">
          <Logo />
        </Link>
        <span aria-hidden className="grid size-11 place-items-center">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.name || user.email)}
          </span>
        </span>
      </header>

      {/* Tiroir de navigation (mobile) */}
      <dialog
        ref={drawer}
        aria-label="Menu principal"
        onClose={() => setOpenedOn(null)}
        onClick={(e) => {
          if (e.target === drawer.current) setOpenedOn(null);
        }}
        className="shadow-pop open:animate-slide-in-left m-0 h-dvh max-h-dvh w-[min(320px,86vw)] max-w-none overflow-y-auto border-r bg-paper p-0 text-foreground backdrop:bg-foreground/40 lg:hidden"
      >
        <div className="flex min-h-full flex-col px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo className="text-lg" />
            <button
              type="button"
              onClick={() => setOpenedOn(null)}
              aria-label="Fermer le menu"
              className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mt-4 rounded-xl border bg-card p-3 shadow-card">{switcher}</div>
          <div className="mt-5 flex-1">
            <AppNav items={items} onNavigate={() => setOpenedOn(null)} />
          </div>
          <div className="mt-5 grid gap-1 border-t pt-3">
            <Link
              href="/onboarding?nouvelle=1"
              className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"
            >
              <Plus className="size-[18px]" aria-hidden />
              Ajouter une entreprise
            </Link>
            <div className="flex items-center justify-between gap-2 px-1 pt-2">
              <Profile user={user} roleLabel={roleLabel} />
              <SignOutButton iconOnly />
            </div>
          </div>
        </div>
      </dialog>

      <div
        className={cn(
          "min-w-0 transition-[padding] duration-200 print:pl-0",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
