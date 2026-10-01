import Link from "next/link";
import { AppNav, type NavItem } from "@/components/layout/app-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { requireTenantPage } from "@/server/tenant/context";

/**
 * Sections disponibles. Chaque phase ajoute la sienne ici
 * (Factures, Devis, Clients, Produits, Paiements, FacturDZ AI, Rapports, Paramètres).
 */
const NAV_ITEMS: NavItem[] = [{ href: "/dashboard", label: "Tableau de bord" }];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { context, memberships } = await requireTenantPage();
  const current = {
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    role: context.role,
  };
  const switcher = <OrganizationSwitcher current={current} memberships={memberships} />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-paper px-3 py-5 lg:flex">
        <Link href="/dashboard" className="px-3 font-semibold tracking-tight">
          FacturDZ <span className="text-primary">AI</span>
        </Link>
        <div className="mt-6 px-3">{switcher}</div>
        <div className="mt-6 flex-1">
          <AppNav items={NAV_ITEMS} />
        </div>
        <div className="grid gap-2 px-3">
          <Link
            href="/onboarding?nouvelle=1"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Ajouter une entreprise
          </Link>
          <SignOutButton />
        </div>
      </aside>

      {/* Barre supérieure (mobile et tablette) */}
      <header className="relative flex items-center justify-between gap-3 border-b px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          FacturDZ <span className="text-primary">AI</span>
        </Link>
        <MobileNav items={NAV_ITEMS}>
          {switcher}
          <div className="mt-3 flex items-center justify-between gap-3">
            <Link
              href="/onboarding?nouvelle=1"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Ajouter une entreprise
            </Link>
            <SignOutButton />
          </div>
        </MobileNav>
      </header>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
