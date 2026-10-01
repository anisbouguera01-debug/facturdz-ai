/**
 * Talon de facture illustratif (pages de connexion / inscription).
 * Contenu réaliste et arithmétiquement juste : 10 × 85 000 + 5 × 25 000 = 975 000 HT,
 * TVA 19 % = 185 250, TTC = 1 160 250 DA. Données fictives.
 */
const lines = [
  { label: "Ordinateur portable 15″", qty: "10", amount: "850 000,00" },
  { label: "Imprimante laser", qty: "5", amount: "125 000,00" },
];

export function InvoiceStub() {
  return (
    <figure
      aria-label="Exemple de facture émise avec FacturDZ"
      className="relative w-full max-w-sm rotate-[-1.5deg] bg-card text-card-foreground shadow-[0_1px_0_var(--border),0_18px_40px_-24px_rgb(20_33_28/0.35)]"
    >
      {/* Bord perforé du carnet à souche */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-3 [background:radial-gradient(circle_at_0_50%,var(--paper)_4px,transparent_4.5px)_0_0/12px_14px_repeat-y]"
      />
      <div className="py-7 pr-7 pl-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Atlas Informatique</p>
            <p className="text-xs text-muted-foreground">Hydra, Alger</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Facture</p>
            <p className="font-mono text-sm tabular-nums">FAC-2026-000128</p>
          </div>
        </div>

        <div className="mt-5 text-xs">
          <p className="text-muted-foreground">Facturé à</p>
          <p className="font-medium">SARL Numidia Tech</p>
        </div>

        <table className="mt-5 w-full text-xs">
          <caption className="sr-only">Lignes de la facture</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-normal">Désignation</th>
              <th className="pb-2 text-right font-normal">Qté</th>
              <th className="pb-2 text-right font-normal">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label} className="border-b border-dashed">
                <td className="py-2 pr-2">{l.label}</td>
                <td className="py-2 text-right font-mono tabular-nums">{l.qty}</td>
                <td className="py-2 text-right font-mono tabular-nums">{l.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Total HT</dt>
          <dd className="text-right font-mono tabular-nums">975 000,00</dd>
          <dt className="text-muted-foreground">TVA 19 %</dt>
          <dd className="text-right font-mono tabular-nums">185 250,00</dd>
          <dt className="mt-2 border-t pt-2 font-semibold">Total TTC</dt>
          <dd className="mt-2 border-t pt-2 text-right font-mono text-sm font-semibold tabular-nums">
            1 160 250,00 DA
          </dd>
        </dl>
      </div>

      {/* Cachet « Payée » à l'encre bleue */}
      <div
        aria-hidden
        className="absolute right-6 bottom-24 grid size-24 rotate-[-14deg] place-items-center rounded-full border-[2.5px] border-stamp/80 text-stamp/85 mix-blend-multiply dark:mix-blend-screen"
      >
        <div className="grid size-[84px] place-items-center rounded-full border border-stamp/60 text-center leading-tight">
          <span>
            <span className="block text-[15px] font-bold tracking-wide">Payée</span>
            <span className="block font-mono text-[9px]">14/09/2026</span>
          </span>
        </div>
      </div>
    </figure>
  );
}
