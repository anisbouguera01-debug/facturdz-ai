import type { Metadata } from "next";
import {
  AiSection,
  DashboardSection,
  Faq,
  Features,
  FinalCta,
  Footer,
  Header,
  Hero,
  PdfSection,
  Pricing,
  Security,
} from "@/components/landing/sections";
import { getCurrentSession } from "@/server/auth/session";
import { listPublicPlans } from "@/server/plans-public";

export const metadata: Metadata = {
  title: { absolute: "FacturDZ AI — Facturation intelligente pour les entreprises algériennes" },
  description:
    "Facturation, devis, paiements et intelligence artificielle dans une seule plateforme. Numérotation continue, TVA calculée par le serveur, factures PDF.",
};

export default async function HomePage() {
  const [session, plans] = await Promise.all([getCurrentSession(), listPublicPlans()]);
  const signedIn = Boolean(session);
  return (
    <>
      <Header signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <Features />
        <AiSection />
        <DashboardSection />
        <PdfSection />
        <Security />
        <Pricing plans={plans} />
        <Faq />
        <FinalCta signedIn={signedIn} />
      </main>
      <Footer />
    </>
  );
}
