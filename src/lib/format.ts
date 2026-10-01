/**
 * Formatage d'affichage (fr-DZ). Les montants arrivent en chaînes décimales exactes
 * (« 1160250.5 ») et sont formatés SANS conversion en nombre flottant.
 */
const NNBSP = " "; // espace fine insécable, séparateur de milliers français

export function formatAmount(
  value: string | number | { toString(): string },
  decimals = 2,
): string {
  const raw = String(value).trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return raw;
  const [, sign, int, frac = ""] = m;
  // Arrondi demi-supérieur sur la chaîne (au-delà de `decimals`).
  let digits = (int + frac.padEnd(decimals + 1, "0").slice(0, decimals + 1)).split("").map(Number);
  const roundUp = digits.pop()! >= 5;
  if (roundUp) {
    let i = digits.length - 1;
    while (i >= 0) {
      if (digits[i] === 9) {
        digits[i] = 0;
        i--;
      } else {
        digits[i]++;
        break;
      }
    }
    if (i < 0) digits = [1, ...digits];
  }
  const all = digits.join("");
  const intPart = all.slice(0, all.length - decimals) || "0";
  const fracPart = decimals ? all.slice(all.length - decimals) : "";
  const grouped = intPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const isZero = /^[0.]*$/.test(intPart + fracPart);
  return `${sign && !isZero ? "-" : ""}${grouped}${decimals ? `,${fracPart}` : ""}`;
}

export function formatMoney(
  value: string | number | { toString(): string },
  currency = "DZD",
): string {
  const suffix = currency === "DZD" ? "DA" : currency;
  return `${formatAmount(value)}${NNBSP}${suffix}`;
}

const dateFormatter = new Intl.DateTimeFormat("fr-DZ", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** Date « calendaire » (colonnes DATE, stockées à minuit UTC). */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}
