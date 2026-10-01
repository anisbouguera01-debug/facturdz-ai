"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppNav, type NavItem } from "./app-nav";

/** Menu mobile : bouton qui déplie la navigation, refermée à chaque changement de page. */
export function MobileNav({ items, children }: { items: NavItem[]; children?: React.ReactNode }) {
  const pathname = usePathname();
  // Menu ouvert seulement pour la page sur laquelle on l'a ouvert :
  // il se referme donc tout seul après une navigation.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center rounded-md border border-input px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? "Fermer" : "Menu"}
      </button>
      {open ? (
        <div
          id="mobile-nav"
          className="absolute inset-x-0 top-full z-20 border-b bg-background px-4 pt-3 pb-5 shadow-sm"
        >
          {children}
          <div className="mt-3">
            <AppNav items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
