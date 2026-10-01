// Page d'accueil provisoire (Phase 1). La vraie landing page arrive en Phase 20.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-medium tracking-wide text-primary uppercase">FacturDZ AI</p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
        Facturez plus simplement avec FacturDZ AI.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Facturation, devis, paiements et intelligence artificielle dans une seule plateforme.
      </p>
      <p className="text-sm text-muted-foreground">Application en cours de construction.</p>
    </main>
  );
}
