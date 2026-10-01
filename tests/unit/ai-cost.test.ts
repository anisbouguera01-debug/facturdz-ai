import { describe, expect, it } from "vitest";
import { computeCost, type PricingRow } from "@/server/ai/cost";

const pricing = (over: Partial<PricingRow> = {}): PricingRow => ({
  id: "p",
  inputCostPerMillionTokens: "2.5",
  outputCostPerMillionTokens: "10",
  cachedInputCostPerMillionTokens: "1.25",
  currency: "USD",
  ...over,
});
const usage = (inputTokens: number, cachedInputTokens: number, outputTokens: number) => ({
  inputTokens,
  cachedInputTokens,
  outputTokens,
});

describe("coût estimé d'un appel IA", () => {
  it("facture entrée, sortie et entrée en cache à leurs tarifs (par million de jetons)", () => {
    // 600 000 normaux × 2,5 + 400 000 en cache × 1,25 + 100 000 sortie × 10, par million
    // = 1,5 + 0,5 + 1,0 = 3,0
    expect(computeCost(usage(1_000_000, 400_000, 100_000), pricing())).toBe("3.000000");
  });
  it("sans tarif d'entrée en cache, le cache est facturé au tarif d'entrée normal", () => {
    expect(
      computeCost(usage(1_000_000, 400_000, 0), pricing({ cachedInputCostPerMillionTokens: null })),
    ).toBe("2.500000");
  });
  it("petits volumes : précision à 6 décimales, sans flottants", () => {
    // 1 jeton d'entrée à 0,1 $/M = 0,0000001 → arrondi à 6 décimales = 0,000000
    expect(computeCost(usage(1, 0, 0), pricing({ inputCostPerMillionTokens: "0.1" }))).toBe(
      "0.000000",
    );
    // 1 234 jetons d'entrée × 0,15 + 567 de sortie × 0,6, par million
    expect(
      computeCost(
        usage(1234, 0, 567),
        pricing({ inputCostPerMillionTokens: "0.15", outputCostPerMillionTokens: "0.6" }),
      ),
    ).toBe("0.000525"); // 0,0001851 + 0,0003402 = 0,0005253
  });
  it("le cache ne peut pas dépasser l'entrée (données incohérentes du fournisseur)", () => {
    expect(computeCost(usage(100, 500, 0), pricing())).toBe(
      computeCost(usage(100, 100, 0), pricing()),
    );
  });
  it("aucun jeton = coût nul exact", () => {
    expect(computeCost(usage(0, 0, 0), pricing())).toBe("0.000000");
  });
});
