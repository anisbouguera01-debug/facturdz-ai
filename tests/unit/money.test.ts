import { describe, expect, it } from "vitest";
import {
  formatRate,
  moneySchema,
  normalizeDecimalInput,
  ratePercentSchema,
  round2,
  ttcFromHt,
  vatAmount,
} from "@/lib/money";

describe("arrondis et TVA", () => {
  it("arrondit au demi-supérieur", () => {
    expect(round2("0.005").toFixed(2)).toBe("0.01");
    expect(round2("0.004").toFixed(2)).toBe("0.00");
    expect(round2("2.675").toFixed(2)).toBe("2.68"); // 2.67 avec des flottants
  });

  it("évite les erreurs des nombres flottants", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en JavaScript
    expect(round2("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(vatAmount("1.15", "19").toFixed(2)).toBe("0.22"); // 0.2185 → 0.22
  });

  it("calcule la TVA et le TTC de l'exemple du cahier des charges", () => {
    expect(vatAmount("975000", "19").toFixed(2)).toBe("185250.00");
    expect(ttcFromHt("975000", "19").toFixed(2)).toBe("1160250.00");
    expect(ttcFromHt("85000", "0").toFixed(2)).toBe("85000.00");
  });
});

describe("saisie des montants", () => {
  it("normalise la saisie française", () => {
    expect(normalizeDecimalInput(" 1 234,50 ")).toBe("1234.50");
    expect(normalizeDecimalInput("85 000")).toBe("85000");
  });

  it.each([
    ["85000", "85000.00"],
    ["1 250,5", "1250.50"],
    [85000, "85000.00"],
    ["0", "0.00"],
    ["999999999999.99", "999999999999.99"],
  ])("accepte %s → %s", (input, expected) => {
    expect(moneySchema.parse(input)).toBe(expected);
  });

  it.each(["", "-5", "abc", "12.345", "1e5", "1000000000000", "12,3,4"])(
    "refuse « %s »",
    (input) => {
      expect(moneySchema.safeParse(input).success).toBe(false);
    },
  );
});

describe("taux", () => {
  it("accepte 0 à 100 avec deux décimales", () => {
    expect(ratePercentSchema.parse("19")).toBe("19.00");
    expect(ratePercentSchema.parse("9,5 %".replace(" ", ""))).toBe("9.50");
    expect(ratePercentSchema.parse("0")).toBe("0.00");
  });

  it("refuse les taux hors limites ou mal formés", () => {
    for (const v of ["101", "-1", "19.555", "dix"]) {
      expect(ratePercentSchema.safeParse(v).success).toBe(false);
    }
  });

  it("affiche un taux lisible", () => {
    expect(formatRate("19.00")).toBe("19 %");
    expect(formatRate("9.50")).toBe("9,5 %");
  });
});
