import { describe, expect, it } from "vitest";
import { formatAmount, formatDate, formatMoney } from "@/lib/format";

const N = " ";

describe("formatAmount", () => {
  it.each([
    ["0", "0,00"],
    ["5", "5,00"],
    ["1160250", `1${N}160${N}250,00`],
    ["975000.5", `975${N}000,50`],
    ["1234.567", `1${N}234,57`],
    ["1234.565", `1${N}234,57`],
    ["1234.564", `1${N}234,56`],
    ["999.995", `1${N}000,00`],
    ["0.004", "0,00"],
    ["-0.001", "0,00"],
    ["-1500.25", `-1${N}500,25`],
    // Au-delà de la précision d'un float : aucune perte.
    ["999999999999.99", `999${N}999${N}999${N}999,99`],
  ])("%s → %s", (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it("renvoie l'entrée telle quelle si elle n'est pas un nombre", () => {
    expect(formatAmount("abc")).toBe("abc");
  });
});

describe("formatMoney et formatDate", () => {
  it("affiche les dinars avec DA", () => {
    expect(formatMoney("185250")).toBe(`185${N}250,00${N}DA`);
    expect(formatMoney("10", "EUR")).toBe(`10,00${N}EUR`);
  });

  it("formate une date calendaire sans décalage de fuseau", () => {
    expect(formatDate(new Date("2026-10-01T00:00:00Z"))).toBe("01/10/2026");
    expect(formatDate(null)).toBe("—");
  });
});
