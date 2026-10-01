import { describe, expect, it } from "vitest";
import { computeDocument, computeLine, lineInputSchema, quantitySchema } from "@/lib/billing";
import { addDays, isoDateSchema, todayISO } from "@/lib/dates";

const line = (q: string, p: string, vat = "19.00", disc = "0.00") => ({
  quantity: q,
  unitPrice: p,
  vatRate: vat,
  discountRate: disc,
});

describe("calcul d'une ligne", () => {
  it("quantité × prix, remise, TVA, TTC", () => {
    const l = computeLine(line("10", "85000", "19", "5"));
    expect(l.gross.toFixed(2)).toBe("850000.00");
    expect(l.discount.toFixed(2)).toBe("42500.00");
    expect(l.subtotal.toFixed(2)).toBe("807500.00");
    expect(l.taxAmount.toFixed(2)).toBe("153425.00");
    expect(l.total.toFixed(2)).toBe("960925.00");
  });

  it("arrondit chaque étape au centime (demi-supérieur)", () => {
    // 3 × 33.335 n'existe pas (prix à 2 décimales) ; on teste quantités décimales :
    const l = computeLine(line("1.333", "10.01", "19", "0")); // 13.34333 → 13.34
    expect(l.gross.toFixed(2)).toBe("13.34");
    expect(l.taxAmount.toFixed(2)).toBe("2.53"); // 2.5346 → 2.53
    expect(l.total.toFixed(2)).toBe("15.87");
    const half = computeLine(line("1", "0.05", "10", "0")); // TVA 0.005 → 0.01
    expect(half.taxAmount.toFixed(2)).toBe("0.01");
  });

  it("remise de 100 % et TVA à 0", () => {
    expect(computeLine(line("2", "500", "19", "100")).total.toFixed(2)).toBe("0.00");
    expect(computeLine(line("2", "500", "0", "0")).total.toFixed(2)).toBe("1000.00");
  });
});

describe("calcul d'un document", () => {
  it("exemple du cahier des charges : 10 ordinateurs à 85 000 et 5 imprimantes à 25 000", () => {
    const t = computeDocument([line("10", "85000"), line("5", "25000")]);
    expect(t.subtotal.toFixed(2)).toBe("975000.00");
    expect(t.taxTotal.toFixed(2)).toBe("185250.00");
    expect(t.total.toFixed(2)).toBe("1160250.00");
  });

  it("le total est toujours la somme exacte des lignes", () => {
    const lines = Array.from({ length: 50 }, (_, i) =>
      line(`${(i % 7) + 0.125}`, `${(i * 37.33).toFixed(2)}`, i % 2 ? "19" : "9", `${i % 4}`),
    );
    const t = computeDocument(lines);
    const sumTotals = t.lines.reduce(
      (a, l) => a.plus(l.total),
      t.lines[0].total.minus(t.lines[0].total),
    );
    expect(t.total.equals(sumTotals)).toBe(true);
    expect(t.total.equals(t.subtotal.plus(t.taxTotal))).toBe(true);
    expect(t.grossTotal.minus(t.discountTotal).equals(t.subtotal)).toBe(true);
  });

  it("ventile la TVA par taux", () => {
    const t = computeDocument([
      line("1", "100", "19"),
      line("1", "200", "9"),
      line("2", "50", "19"),
    ]);
    expect(t.vatBreakdown.map((v) => [v.rate, v.base.toFixed(2), v.tax.toFixed(2)])).toEqual([
      ["19.00", "200.00", "38.00"],
      ["9.00", "200.00", "18.00"],
    ]);
  });

  it("document vide = zéro", () => {
    expect(computeDocument([]).total.toFixed(2)).toBe("0.00");
  });
});

describe("validation des lignes", () => {
  it("canonise les valeurs saisies en français", () => {
    expect(
      lineInputSchema.parse({
        description: " PC ",
        quantity: "2,5",
        unitPrice: "1 000,5",
        vatRate: "19",
        discountRate: "",
      }),
    ).toEqual({
      description: "PC",
      quantity: "2.500",
      unitPrice: "1000.50",
      vatRate: "19.00",
      discountRate: "0.00",
    });
  });

  it.each(["0", "-1", "1.2345", "abc", "1000000000"])("refuse la quantité « %s »", (q) => {
    expect(quantitySchema.safeParse(q).success).toBe(false);
  });

  it("refuse une remise > 100 % et une désignation vide", () => {
    expect(
      lineInputSchema.safeParse({
        description: "x",
        quantity: "1",
        unitPrice: "1",
        vatRate: "19",
        discountRate: "120",
      }).success,
    ).toBe(false);
    expect(
      lineInputSchema.safeParse({ description: " ", quantity: "1", unitPrice: "1", vatRate: "19" })
        .success,
    ).toBe(false);
  });
});

describe("dates", () => {
  it("date du jour en heure d'Alger", () => {
    // 23 h 30 UTC le 31/12 = 00 h 30 le 01/01 à Alger (UTC+1)
    expect(todayISO(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(todayISO(new Date("2026-06-15T10:00:00Z"))).toBe("2026-06-15");
  });

  it("ajoute des jours et valide les dates", () => {
    expect(addDays("2026-01-31", 30)).toBe("2026-03-02");
    expect(isoDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(isoDateSchema.safeParse("2026-02-28").success).toBe(true);
    expect(isoDateSchema.safeParse("28/02/2026").success).toBe(false);
  });
});
