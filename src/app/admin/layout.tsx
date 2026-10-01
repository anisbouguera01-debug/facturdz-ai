import Link from "next/link";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { requireSuperAdminPage } from "@/server/admin/context";

const LINKS = [
  { href: "/admin", label: "Vue d'ensemble" },
  { href: "/admin/organizations", label: "Entreprises" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/plans", label: "Plans et limites" },
  { href: "/admin/pricing", label: "Tarifs IA" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireSuperAdminPage(); // 404 pour toute personne qui n'est pas super admin
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="font-semibold tracking-tight">
              FacturDZ <span className="text-primary">Admin</span>
            </span>
            <nav aria-label="Administration" className="flex flex-wrap gap-4 text-sm">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm underline-offset-4 hover:underline">
              Retour à l&apos;application
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">{children}</div>
    </div>
  );
}
