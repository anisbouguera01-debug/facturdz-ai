import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL, LEGAL_LABELS, missingLegalFields, type LegalKey } from "@/lib/legal-config";

const full = Object.fromEntries(
  (Object.keys(LEGAL_LABELS) as LegalKey[]).map((k) => [k, "x"]),
) as Record<LegalKey, string | null>;

describe("configuration légale", () => {
  it("liste tous les champs obligatoires manquants (le téléphone est facultatif)", () => {
    const missing = missingLegalFields({ ...full, rc: null, nif: "  ", phone: null });
    expect(missing).toEqual(["rc", "nif"]);
  });

  it("ne signale rien quand tout est renseigné", () => {
    expect(missingLegalFields(full)).toEqual([]);
  });

  it("la configuration livrée est un gabarit : rien d'inventé", () => {
    expect(missingLegalFields(LEGAL).length).toBeGreaterThan(0);
  });
});

describe("pages légales", () => {
  const pages = ["mentions-legales", "cgu", "confidentialite"];

  it.each(pages)("la page %s existe et passe par la mise en page avec avertissement", (p) => {
    expect(() => readFileSync(`src/app/(legal)/${p}/page.tsx`, "utf8")).not.toThrow();
  });

  it("la mise en page légale affiche l'avertissement de validation juridique", () => {
    const layout = readFileSync("src/app/(legal)/layout.tsx", "utf8");
    expect(layout).toContain("DraftNotice");
    const ui = readFileSync("src/components/legal/legal-ui.tsx", "utf8");
    expect(ui.toLowerCase()).toContain("valid");
  });

  it("le pied de page et l'inscription renvoient vers les pages légales", () => {
    const footer = readFileSync("src/components/landing/sections.tsx", "utf8");
    const register = readFileSync("src/components/forms/register-form.tsx", "utf8");
    for (const href of ["/mentions-legales", "/cgu", "/confidentialite"]) {
      expect(readFileSync("src/components/legal/legal-ui.tsx", "utf8")).toContain(href);
    }
    expect(footer).toContain("LEGAL_LINKS");
    expect(register).toContain("/cgu");
    expect(register).toContain("/confidentialite");
  });
});
