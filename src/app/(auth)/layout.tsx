import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { InvoiceStub } from "@/components/layout/invoice-stub";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between bg-paper px-10 py-10 lg:flex">
        <Link href="/" className="w-fit text-base font-semibold tracking-tight">
          <Logo />
        </Link>
        <div className="flex justify-center py-10">
          <InvoiceStub />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          Numérotation continue, TVA calculée par le serveur, factures prêtes à imprimer.
        </p>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-10">
        <Link href="/" className="w-fit text-base font-semibold tracking-tight lg:hidden">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-md py-10 sm:mx-auto lg:mx-0 lg:ml-[12%]">{children}</div>
        </div>
      </main>
    </div>
  );
}
