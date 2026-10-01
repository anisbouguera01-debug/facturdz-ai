import { formatAmount, formatMoney } from "@/lib/format";

/**
 * Facturé et encaissé par mois (barres groupées). Rendu serveur en SVG, sans bibliothèque :
 * - une seule échelle (jamais de double axe), base à zéro ;
 * - légende toujours visible, couleurs non seules porteuses (légende + info-bulle + tableau) ;
 * - info-bulle native (<title>) sur chaque barre, tableau complet en dessous ;
 * - couleurs --chart-1 / --chart-2, validées en clair et en sombre.
 * Les montants affichés viennent des chaînes décimales du serveur ; les nombres ne servent
 * qu'à la géométrie du dessin.
 */
export interface MonthPoint {
  month: string;
  label: string;
  invoiced: string;
  collected: string;
}

const W = 760;
const H = 280;
const PAD = { top: 16, right: 12, bottom: 30, left: 56 };

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  // Pas multiples de 4 : quatre intervalles de graduation « ronds » (1, 2, 3, 4 M…).
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 10;
  return step * pow;
}

function compact(v: number): string {
  if (v === 0) return "0";
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)} M`.replace(".", ",");
  if (v >= 1_000) return `${+(v / 1_000).toFixed(1)} k`.replace(".", ",");
  return String(v);
}

/** Rectangle dont seul le haut est arrondi (4 px), ancré sur la base. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function RevenueChart({ data }: { data: MonthPoint[] }) {
  const values = data.flatMap((d) => [Number(d.invoiced), Number(d.collected)]);
  const max = niceMax(Math.max(...values, 0));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const group = innerW / data.length;
  const barW = Math.min(18, (group - 14) / 2);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const empty = values.every((v) => v === 0);

  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base font-semibold">Facturé et encaissé, 12 derniers mois</span>
        <ul className="flex gap-4 text-sm" aria-label="Légende">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px]"
              style={{ background: "var(--chart-1)" }}
            />
            Facturé (TTC)
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-[3px]"
              style={{ background: "var(--chart-2)" }}
            />
            Encaissé
          </li>
        </ul>
      </figcaption>

      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Graphique en barres du facturé et de l'encaissé par mois ; les valeurs sont dans le tableau ci-dessous."
          className="h-auto w-full min-w-[560px]"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                {compact(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const gx = PAD.left + i * group + (group - (2 * barW + 2)) / 2;
            const bars = [
              {
                v: Number(d.invoiced),
                label: "Facturé",
                amount: d.invoiced,
                color: "var(--chart-1)",
                x: gx,
              },
              {
                v: Number(d.collected),
                label: "Encaissé",
                amount: d.collected,
                color: "var(--chart-2)",
                x: gx + barW + 2,
              },
            ];
            return (
              <g key={d.month}>
                {bars.map((b) =>
                  b.v > 0 ? (
                    <path
                      key={b.label}
                      d={barPath(b.x, y(b.v), barW, y(0) - y(b.v))}
                      fill={b.color}
                    >
                      <title>{`${d.label} · ${b.label} : ${formatMoney(b.amount)}`}</title>
                    </path>
                  ) : null,
                )}
                <text
                  x={PAD.left + i * group + group / 2}
                  y={H - 10}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--muted-foreground)"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--input)"
            strokeWidth={1}
          />
        </svg>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">
          Aucune facture émise sur la période : le graphique se remplira dès la première émission.
        </p>
      ) : null}

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Afficher les valeurs en tableau
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="sr-only">Facturé et encaissé par mois, en dinars</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Mois
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Facturé (TTC)
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Encaissé
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-b border-dashed">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {d.label}
                  </th>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                    {formatAmount(d.invoiced)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {formatAmount(d.collected)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
