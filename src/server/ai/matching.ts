/**
 * Rapprochement des noms cités par l'utilisateur (via le modèle) avec les clients et produits
 * de l'entreprise. Fait côté serveur, sans IA : le modèle ne voit jamais la base.
 * Règle de prudence : on ne présélectionne que s'il n'y a AUCUNE ambiguïté ; sinon
 * l'utilisateur choisit dans la prévisualisation.
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LEGAL_FORMS = new Set([
  "sarl",
  "eurl",
  "spa",
  "snc",
  "sas",
  "scs",
  "ets",
  "ste",
  "societe",
  "entreprise",
]);

const stem = (t: string) => (t.length > 3 ? t.replace(/[sx]$/, "") : t);
const tokens = (s: string) => normalizeName(s).split(" ").filter(Boolean);
const coreTokens = (s: string) =>
  tokens(s)
    .filter((t) => !LEGAL_FORMS.has(t))
    .map(stem);

export interface NamedRecord {
  id: string;
  name: string;
  companyName?: string | null;
}

export function matchCustomer(query: string, customers: NamedRecord[]) {
  const q = normalizeName(query);
  const qCore = coreTokens(query);
  const exact: NamedRecord[] = [];
  const strong: NamedRecord[] = [];
  const weak: NamedRecord[] = [];
  for (const c of customers) {
    const names = [c.name, c.companyName].filter((n): n is string => Boolean(n));
    if (names.some((n) => normalizeName(n) === q)) {
      exact.push(c);
      continue;
    }
    const cores = names.map(coreTokens);
    if (
      qCore.length > 0 &&
      cores.some((t) => t.length === qCore.length && qCore.every((x) => t.includes(x)))
    ) {
      strong.push(c);
    } else if (
      qCore.length > 0 &&
      cores.some(
        (t) =>
          t.length > 0 && (qCore.every((x) => t.includes(x)) || t.every((x) => qCore.includes(x))),
      )
    ) {
      weak.push(c);
    }
  }
  const selected =
    exact.length === 1
      ? exact[0]
      : exact.length === 0 && strong.length === 1 && weak.length === 0
        ? strong[0]
        : null;
  const candidates = [...exact, ...strong, ...weak]
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.name }));
  return { selectedId: selected?.id ?? null, candidates };
}

export interface ProductRecord {
  id: string;
  name: string;
}

/** Produit du catalogue correspondant à une désignation, ou null si absent / ambigu. */
export function matchProduct<P extends ProductRecord>(
  description: string,
  products: P[],
): P | null {
  const d = tokens(description).map(stem);
  if (d.length === 0) return null;
  const dJoined = ` ${d.join(" ")} `;
  const scored: { p: P; score: number }[] = [];
  for (const p of products) {
    const n = tokens(p.name).map(stem);
    if (n.length === 0) continue;
    const nJoined = ` ${n.join(" ")} `;
    let score = 0;
    if (dJoined === nJoined) score = 3;
    else if (dJoined.includes(nJoined)) score = 2;
    else if (d.join(" ").length >= 4 && nJoined.includes(dJoined)) score = 1;
    if (score > 0) scored.push({ p, score });
  }
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best);
  return top.length === 1 ? top[0].p : null;
}
