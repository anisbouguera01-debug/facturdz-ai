import { formatDate, formatMoney } from "@/lib/format";
import { formatRate, Money } from "@/lib/money";

/**
 * Rendu « papier » d'un devis ou d'une facture à l'écran (le PDF suivra la même
 * structure en Phase 10). Tous les montants affichés sont ceux stockés par le serveur.
 */
interface Party {
  name: string;
  legalName?: string | null;
  companyName?: string | null;
  address?: string | null;
  commune?: string | null;
  wilaya?: string | null;
  phone?: string | null;
  email?: string | null;
  nif?: string | null;
  nis?: string | null;
  rc?: string | null;
  articleImposition?: string | null;
}

interface Item {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  vatRate: string;
  subtotal: string;
  taxAmount: string;
}

const qty = (q: string) => new Money(q).toDecimalPlaces(3).toString().replace(".", ",");

function PartyBlock({ title, party }: { title: string; party: Party }) {
  const legal: [string, string | null | undefined][] = [
    ["NIF", party.nif],
    ["NIS", party.nis],
    ["RC", party.rc],
    ["AI", party.articleImposition],
  ];
  const place = [party.commune, party.wilaya].filter(Boolean).join(", ");
  return (
    <div className="text-sm">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 font-semibold">{party.legalName || party.companyName || party.name}</p>
      {party.address ? <p>{party.address}</p> : null}
      {place ? <p>{place}</p> : null}
      {party.phone ? <p>{party.phone}</p> : null}
      {party.email ? <p>{party.email}</p> : null}
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 font-mono text-xs text-muted-foreground">
        {legal
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export function DocumentView({
  title,
  number,
  dates,
  seller,
  customer,
  items,
  totals,
  notes,
  terms,
}: {
  title: string;
  number: string | null;
  dates: [string, Date | null][];
  seller: Party;
  customer: Party;
  items: Item[];
  totals: { subtotal: string; discountTotal: string; taxTotal: string; total: string };
  notes?: string | null;
  terms?: string | null;
}) {
  const hasDiscount = items.some((i) => new Money(i.discountRate).gt(0));
  const byRate = new Map<string, { base: Money; tax: Money }>();
  for (const it of items) {
    const cur = byRate.get(it.vatRate) ?? { base: new Money(0), tax: new Money(0) };
    byRate.set(it.vatRate, { base: cur.base.plus(it.subtotal), tax: cur.tax.plus(it.taxAmount) });
  }
  const vat = [...byRate.entries()].sort((a, b) => new Money(b[0]).comparedTo(a[0]));

  return (
    <article className="rounded-lg border bg-card p-5 text-card-foreground sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <PartyBlock title="Émetteur" party={seller} />
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="font-mono text-lg font-semibold tabular-nums">
            {number ?? "Brouillon non numéroté"}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 text-sm">
            {dates.map(([label, d]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono tabular-nums">{formatDate(d)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="mt-8">
        <PartyBlock title="Client" party={customer} />
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Lignes du document</caption>
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Désignation
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Qté
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                PU HT
              </th>
              {hasDiscount ? (
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Remise
                </th>
              ) : null}
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                TVA
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Montant HT
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-dashed align-top">
                <td className="py-2.5 pr-3 whitespace-pre-line">{it.description}</td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                  {qty(it.quantity)}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                  {formatMoney(it.unitPrice)}
                </td>
                {hasDiscount ? (
                  <td className="py-2.5 pr-3 text-right text-muted-foreground">
                    {new Money(it.discountRate).gt(0) ? formatRate(it.discountRate) : "—"}
                  </td>
                ) : null}
                <td className="py-2.5 pr-3 text-right text-muted-foreground">
                  {formatRate(it.vatRate)}
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums">
                  {formatMoney(it.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end">
        <dl className="grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          {new Money(totals.discountTotal).gt(0) ? (
            <>
              <dt className="text-muted-foreground">dont remises</dt>
              <dd className="text-right font-mono tabular-nums">
                {formatMoney(totals.discountTotal)}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Total HT</dt>
          <dd className="text-right font-mono tabular-nums">{formatMoney(totals.subtotal)}</dd>
          {vat.map(([rate, v]) => (
            <div key={rate} className="contents">
              <dt className="text-muted-foreground">
                TVA {formatRate(rate)} sur {formatMoney(v.base.toFixed(2))}
              </dt>
              <dd className="text-right font-mono tabular-nums">{formatMoney(v.tax.toFixed(2))}</dd>
            </div>
          ))}
          <dt className="mt-1 border-t pt-2 text-base font-semibold">Total TTC</dt>
          <dd className="mt-1 border-t pt-2 text-right font-mono text-base font-semibold tabular-nums">
            {formatMoney(totals.total)}
          </dd>
        </dl>
      </div>

      {notes || terms ? (
        <footer className="mt-8 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2">
          {notes ? (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-line">{notes}</p>
            </div>
          ) : null}
          {terms ? (
            <div>
              <p className="text-xs text-muted-foreground">Conditions</p>
              <p className="mt-1 whitespace-pre-line">{terms}</p>
            </div>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
