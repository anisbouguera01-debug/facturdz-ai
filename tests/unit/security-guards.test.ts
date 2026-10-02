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

/** Routes publiques par conception : sans donnée, sans session (sondes de l'hébergeur). */
const PUBLIC_ROUTES = ["/api/health/", "/api/ready/"];

describe("routes", () => {
  it("les routes publiques ne lisent aucune donnée métier", () => {
    for (const r of PUBLIC_ROUTES) {
      const file = files.find((f) => f.includes(r))!;
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/organization|invoice|customer|session|user\./i);
    }
  });

  it.each(
    files.filter(
      (f) =>
        /\/route\.ts$/.test(f) &&
        !f.includes("/api/auth/") &&
        !PUBLIC_ROUTES.some((r) => f.includes(r)),
    ),
  )("%s : contrôle d'accès", (file) => {
    expect(GUARDS.test(readFileSync(file, "utf8")), file).toBe(true);
  });
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

describe("secrets et navigateur (test critique n°7)", () => {
  const all = walk("src").filter((f) => /\.tsx?$/.test(f));
  const clientFiles = all.filter((f) => /^(["'])use client\1/.test(readFileSync(f, "utf8")));

  it("détecte bien les composants client", () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it("aucun composant client n'importe de code serveur (hors types)", () => {
    for (const f of clientFiles) {
      const imports = readFileSync(f, "utf8").match(/^import[^;]*from\s+["'][^"']+["']/gm) ?? [];
      for (const line of imports) {
        const isServer = /from\s+["'](@\/server\/|\.\.?\/.*server\/|server-only|@\/generated)/.test(
          line,
        );
        if (isServer) expect(/^import\s+type\b/.test(line), `${f} : ${line}`).toBe(true);
      }
    }
  });

  it("aucune variable NEXT_PUBLIC_ ne porte un secret", () => {
    for (const f of all) {
      const names = readFileSync(f, "utf8").match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? [];
      for (const n of names) expect(n, f).not.toMatch(/KEY|SECRET|TOKEN|PASSWORD|DATABASE/);
    }
  });

  it("les clés des fournisseurs IA ne sont lues que dans src/server", () => {
    for (const f of all.filter((x) => !x.startsWith("src/server"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/OPENAI_API_KEY|GEMINI_API_KEY/);
    }
  });
});
