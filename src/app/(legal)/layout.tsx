import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { DraftNotice } from "@/components/legal/legal-ui";
import { LegalOtherDocs } from "@/components/legal/legal-nav";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="font-semibold tracking-tight">
            <Logo />
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <div className="max-w-3xl">
          <DraftNotice />
        </div>
        <div className="mt-8">{children}</div>
        <div className="mt-12 border-t pt-6">
          <LegalOtherDocs />
        </div>
      </main>
    </div>
  );
}
