import { AppShell } from "@/components/layout/app-shell";
import type { NavItem } from "@/components/layout/app-nav";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { getCurrentSession } from "@/server/auth/session";
import { requireTenantPage } from "@/server/tenant/context";

/** Sections disponibles ; une entrée n'apparaît que si le rôle y a accès. */
const NAV_ITEMS: (NavItem & { permission?: Permission })[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: "dashboard", group: "Gestion" },
  {
    href: "/invoices",
    label: "Factures",
    icon: "invoices",
    group: "Gestion",
    permission: "invoices:read",
  },
  { href: "/quotes", label: "Devis", icon: "quotes", group: "Gestion", permission: "quotes:read" },
  {
    href: "/payments",
    label: "Paiements",
    icon: "payments",
    group: "Gestion",
    permission: "payments:read",
  },
  {
    href: "/customers",
    label: "Clients",
    icon: "customers",
    group: "Catalogue",
    permission: "customers:read",
  },
  {
    href: "/products",
    label: "Produits et services",
    icon: "products",
    group: "Catalogue",
    permission: "products:read",
  },
  { href: "/ai", label: "FacturDZ AI", icon: "ai", group: "Assistant", permission: "ai:use" },
  {
    href: "/settings",
    label: "Paramètres",
    icon: "settings",
    group: "Compte",
    permission: "settings:manage",
  },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { context, memberships } = await requireTenantPage();
  const current = {
    organizationId: context.organizationId,
    organizationName: context.organizationName,
    role: context.role,
  };
  // Une entrée n'apparaît que si le rôle y a accès (le serveur revérifie de toute façon).
  const navItems: NavItem[] = NAV_ITEMS.filter(
    (i) => !i.permission || can(context.role, i.permission),
  ).map(({ href, label, icon, group }) => ({ href, label, icon, group }));
  // Lien d'administration réservé au super admin (le panneau revérifie en base, et répond 404 sinon).
  if ((await getCurrentSession())?.user.platformRole === "SUPER_ADMIN") {
    navItems.push({ href: "/admin", label: "Administration", icon: "admin", group: "Compte" });
  }
  const switcher = <OrganizationSwitcher current={current} memberships={memberships} />;
  const session = await getCurrentSession();

  return (
    <AppShell
      items={navItems}
      switcher={switcher}
      organizationName={context.organizationName}
      user={{ name: session?.user.name ?? "", email: session?.user.email ?? "" }}
      roleLabel={ROLE_LABELS[context.role]}
    >
      {children}
    </AppShell>
  );
}
