/**
 * Garde-fous statiques : une server action appelable directement par n'importe quel client
 * doit commencer par une vérification d'accès, et les routes protégées aussi.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "@/lib/csp";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk("src/app");
const GUARDS = /\b(requireTenant|requireSuperAdmin|requireSession|currentActor)\(/;

/** Corps (approximatif) de chaque `export async function` : jusqu'à la déclaration suivante. */
function exportedFunctions(src: string) {
  const parts = src.split(/^export async function /m).slice(1);
  return parts.map((p) => ({ name: p.split("(")[0]!, body: p }));
}

describe("server actions", () => {
  const actionFiles = files.filter((f) => /\/actions\.ts$/.test(f));

  it("détecte bien les fichiers d'actions", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(8);
  });

  it.each(actionFiles)("%s : chaque action vérifie l'accès", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src.startsWith('"use server"')).toBe(true);
    const fns = exportedFunctions(src);
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) {
      expect(GUARDS.test(fn.body), `${file} : ${fn.name} sans contrôle d'accès`).toBe(true);
    }
  });

  it("les actions d'écriture exigent une permission explicite (jamais requireTenant() nu)", () => {
    for (const file of actionFiles) {
      const src = readFileSync(file, "utf8");
      expect(/requireTenant\(\s*\)/.test(src), `${file}`).toBe(false);
    }
  });

  it("les actions d'admin passent toutes par requireSuperAdmin", () => {
    const src = readFileSync("src/app/admin/actions.ts", "utf8");
    for (const fn of exportedFunctions(src)) expect(fn.body).toContain("requireSuperAdmin(");
  });
});

describe("routes", () => {
  it.each(files.filter((f) => /\/route\.ts$/.test(f) && !f.includes("/api/auth/")))(
    "%s : contrôle d'accès",
    (file) => {
      expect(GUARDS.test(readFileSync(file, "utf8")), file).toBe(true);
    },
  );
});

describe("CSP", () => {
  it("n'autorise ni script inline ni eval en production, et verrouille les cadres", () => {
    const csp = buildCsp("abc");
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it("n'ajoute eval et websockets qu'en développement", () => {
    const csp = buildCsp("abc", { dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("génère des nonces uniques de 128 bits", () => {
    const a = generateNonce();
    expect(a).not.toBe(generateNonce());
    expect(atob(a)).toHaveLength(16);
  });
});
