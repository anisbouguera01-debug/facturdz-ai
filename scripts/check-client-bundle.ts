/**
 * Vérifie que le JavaScript envoyé au navigateur (.next/static, produit par `pnpm build`)
 * ne contient aucun secret : valeurs réelles des variables sensibles de l'environnement, noms de
 * variables secrètes, ou formes connues de clés d'API. Échoue (code 1) au premier doute.
 *   pnpm build && pnpm check:bundle
 */
import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const SECRET_ENV = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "SMTP_PASSWORD",
];
// Noms de variables interdits dans le bundle. AUTH_SECRET est volontairement absent : le client
// de Better Auth embarque un utilitaire qui cite ce NOM (jamais sa valeur, contrôlée plus haut).
const NAMES = ["DATABASE_URL", "OPENAI_API_KEY", "GEMINI_API_KEY", "SMTP_PASSWORD"];
const PATTERNS: [string, RegExp][] = [
  ["clé de type OpenAI", /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/],
  ["clé de type Google", /AIza[0-9A-Za-z_-]{35}/],
  ["URL de base de données", /postgres(ql)?:\/\/[^"'\s]+:[^"'\s]+@/],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|css|html|json|map)$/.test(n)) out.push(p);
  }
  return out;
}

function main() {
  let files: string[];
  try {
    files = walk(ROOT);
  } catch {
    console.error("Aucun build trouvé : lancez `pnpm build` d'abord.");
    process.exit(2);
  }
  const values = SECRET_ENV.map((k) => [k, process.env[k]] as const).filter(
    ([, v]) => v && v.length >= 8,
  );
  const problems: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const [k, v] of values) if (text.includes(v!)) problems.push(`${f} : valeur de ${k}`);
    for (const n of NAMES) if (text.includes(n)) problems.push(`${f} : nom de variable ${n}`);
    for (const [label, re] of PATTERNS) if (re.test(text)) problems.push(`${f} : ${label}`);
  }
  if (problems.length) {
    console.error("Secrets possibles dans le bundle navigateur :\n" + problems.join("\n"));
    process.exit(1);
  }
  console.log(`✔ ${files.length} fichiers client analysés : aucun secret.`);
}
main();
