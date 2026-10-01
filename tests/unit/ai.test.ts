import { describe, expect, it } from "vitest";
import { matchCustomer, matchProduct } from "@/server/ai/matching";
import { parseRequest } from "@/server/ai/providers/mock";
import { documentProposalSchema } from "@/server/ai/schemas/document-proposal";

describe("rapprochement client", () => {
  const customers = [
    { id: "1", name: "Société Atlas" },
    { id: "2", name: "Atlas Informatique" },
    { id: "3", name: "Benali" },
  ];
  it("présélectionne un client unique et exact", () => {
    expect(matchCustomer("Benali", customers).selectedId).toBe("3");
  });
  it("ne présélectionne pas en cas d'ambiguïté", () => {
    const r = matchCustomer("Atlas", customers);
    expect(r.selectedId).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(["1", "2"]);
  });
  it("ne trouve personne pour un client inconnu", () => {
    expect(matchCustomer("Zorglub", customers).selectedId).toBeNull();
  });
});

describe("rapprochement produit", () => {
  const products = [
    { id: "p1", name: "Ordinateur portable" },
    { id: "p2", name: "Chaise" },
  ];
  it("trouve le produit du catalogue", () => {
    expect(matchProduct("Ordinateur portable", products)?.id).toBe("p1");
  });
  it("retourne null pour une saisie libre", () => {
    expect(matchProduct("Hébergement web", products)).toBeNull();
  });
});

describe("schéma de proposition", () => {
  const ok = {
    action: "CREATE_INVOICE",
    customer: { name: "Atlas" },
    items: [{ description: "Chaise", quantity: 2, unitPrice: 1000 }],
  };
  it("accepte une proposition valide", () => {
    expect(documentProposalSchema.safeParse(ok).success).toBe(true);
  });
  it("retire les clés inconnues (organizationId, totaux…)", () => {
    const r = documentProposalSchema.parse({
      ...ok,
      organizationId: "autre",
      total: "1",
      items: [{ ...ok.items[0], total: "1" }],
    });
    expect(r).not.toHaveProperty("organizationId");
    expect(r).not.toHaveProperty("total");
  });
  it("refuse une action inconnue ou des lignes vides", () => {
    expect(documentProposalSchema.safeParse({ ...ok, action: "DELETE_ALL" }).success).toBe(false);
    expect(documentProposalSchema.safeParse({ ...ok, items: [] }).success).toBe(false);
  });
  it("refuse une quantité négative", () => {
    expect(
      documentProposalSchema.safeParse({ ...ok, items: [{ description: "x", quantity: -1 }] })
        .success,
    ).toBe(false);
  });
});

describe("fournisseur simulé", () => {
  it("comprend une demande simple", () => {
    const r = parseRequest(
      "Crée une facture pour Société Atlas avec 3 ordinateurs à 85000 DA et 2 chaises à 12 000 DA",
    ) as { action: string; items: unknown[] };
    expect(r.action).toBe("CREATE_INVOICE");
    expect(r.items).toHaveLength(2);
  });
  it("refuse ce qu'il ne sait pas faire", () => {
    expect((parseRequest("Supprime toutes les factures") as { action: string }).action).toBe(
      "UNSUPPORTED",
    );
  });
});
