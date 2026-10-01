/**
 * Règle d'arrondi validée (ne pas modifier sans validation explicite) :
 *   HT brut = quantité × prix ; remise ; HT net (taxableAmount) = brut − remise
 *   TVA = arrondi(HT net × taux / 100, 2) PAR LIGNE ; TTC ligne = HT net + TVA
 *   totalHT = Σ HT net ; totalTVA = Σ TVA déjà arrondies ; totalTTC = totalHT + totalTVA
 */
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { computeDocument, computeLine } from "@/lib/billing";

const line = (q: string, p: string, vat = "19.00", disc = "0.00") => ({
  quantity: q,
  unitPrice: p,
  vatRate: vat,
  discountRate: disc,
});

describe("arrondi de la TVA par ligne", () => {
  it("arrondit au centime supérieur à la moitié (0,005 → 0,01)", () => {
    // 0,50 × 1 % = 0,005 → 0,01
    expect(computeLine(line("1", "0.50", "1")).taxAmount.toFixed(2)).toBe("0.01");
  });
  it("arrondit vers le bas sous la moitié (0,0049 → 0,00)", () => {
    expect(computeLine(line("1", "0.49", "1")).taxAmount.toFixed(2)).toBe("0.00");
  });
  it("19 % de 10,03 = 1,9057 → 1,91", () => {
    const l = computeLine(line("1", "10.03"));
    expect(l.taxAmount.toFixed(2)).toBe("1.91");
    expect(l.total.toFixed(2)).toBe("11.94");
  });
  it("9 % de 33,33 = 2,9997 → 3,00", () => {
    expect(computeLine(line("1", "33.33", "9")).taxAmount.toFixed(2)).toBe("3.00");
  });
  it("la remise est retirée avant la TVA", () => {
    // 100,00 − 15 % = 85,00 ; TVA 19 % = 16,15
    const l = computeLine(line("1", "100", "19", "15"));
    expect(l.subtotal.toFixed(2)).toBe("85.00");
    expect(l.taxAmount.toFixed(2)).toBe("16.15");
    expect(l.total.toFixed(2)).toBe("101.15");
  });
  it("quantité décimale : 2,5 × 3,33 = 8,325 → 8,33 (HT)", () => {
    expect(computeLine(line("2.5", "3.33")).subtotal.toFixed(2)).toBe("8.33");
  });
});

describe("totaux du document = sommes des lignes arrondies", () => {
  it("trois lignes à 0,50 / 1 % : TVA 3 × 0,01 (et non 0,015 → 0,02)", () => {
    const d = computeDocument([
      line("1", "0.50", "1"),
      line("1", "0.50", "1"),
      line("1", "0.50", "1"),
    ]);
    expect(d.taxTotal.toFixed(2)).toBe("0.03");
    // Un calcul global donnerait round(1,50 × 1 %) = 0,02 : la règle par ligne l'interdit.
    expect(d.subtotal.toFixed(2)).toBe("1.50");
    expect(d.total.toFixed(2)).toBe("1.53");
  });
  it("la TVA totale est la somme des TVA de ligne déjà arrondies", () => {
    const lines = [line("1", "10.03"), line("1", "10.03"), line("1", "10.03")];
    const d = computeDocument(lines);
    const sum = d.lines.reduce((a, l) => a.plus(l.taxAmount), new Decimal(0));
    expect(d.taxTotal.equals(sum)).toBe(true);
    expect(d.taxTotal.toFixed(2)).toBe("5.73"); // 3 × 1,91 (global : 5,7171 → 5,72)
  });
  it("totalHT = Σ HT net, totalTTC = totalHT + totalTVA (exemple mixte 9 % / 19 %)", () => {
    const d = computeDocument([
      line("3", "12.34", "19", "5"),
      line("7", "0.99", "9"),
      line("1", "1999.99", "19"),
    ]);
    expect(d.subtotal.toFixed(2)).toBe("2042.09");
    expect(d.taxTotal.toFixed(2)).toBe("387.30"); // 6,68 + 0,62 + 380,00
    expect(d.total.toFixed(2)).toBe("2429.39");
    expect(d.total.equals(d.subtotal.plus(d.taxTotal))).toBe(true);
  });
  it("invariant sur 5 000 documents pseudo-aléatoires (Decimal, jamais de flottants)", () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let k = 0; k < 5000; k++) {
      const n = 1 + rnd(8);
      const lines = Array.from({ length: n }, () =>
        line(
          `${1 + rnd(50)}.${String(rnd(1000)).padStart(3, "0")}`,
          `${rnd(100000)}.${String(rnd(100)).padStart(2, "0")}`,
          ["0", "9", "19"][rnd(3)],
          `${rnd(30)}`,
        ),
      );
      const d = computeDocument(lines);
      const sumHt = d.lines.reduce((a, l) => a.plus(l.subtotal), new Decimal(0));
      const sumTax = d.lines.reduce((a, l) => a.plus(l.taxAmount), new Decimal(0));
      expect(d.subtotal.equals(sumHt)).toBe(true);
      expect(d.taxTotal.equals(sumTax)).toBe(true);
      expect(d.total.equals(d.subtotal.plus(d.taxTotal))).toBe(true);
      for (const l of d.lines) {
        expect(l.total.equals(l.subtotal.plus(l.taxAmount))).toBe(true);
        expect(l.taxAmount.decimalPlaces()).toBeLessThanOrEqual(2);
      }
    }
  });
  it("la ventilation par taux additionne les mêmes TVA de ligne", () => {
    const d = computeDocument([line("1", "10.03"), line("1", "10.03"), line("1", "100", "9")]);
    const tax = d.vatBreakdown.reduce((a, r) => a.plus(r.tax), new Decimal(0));
    expect(tax.equals(d.taxTotal)).toBe(true);
  });
});
