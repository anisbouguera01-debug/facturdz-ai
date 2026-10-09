import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { requireSuperAdminPage } from "@/server/admin/context";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireSuperAdminPage(); // 404 pour toute personne qui n'est pas super admin
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck aria-hidden className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">
              FacturDZ <span className="text-brand">Admin</span>
            </span>
            <Badge tone="info" className="hidden sm:inline-flex">
              Super admin
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retour à l&apos;application
            </Link>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pb-2 sm:px-8">
          <AdminNav />
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</div>
    </div>
  );
}
