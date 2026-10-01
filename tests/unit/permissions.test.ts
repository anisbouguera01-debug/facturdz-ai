import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, permissionsFor, ROLES } from "@/lib/permissions";

describe("matrice des permissions", () => {
  it("donne toutes les permissions au propriétaire", () => {
    for (const p of PERMISSIONS) expect(can("OWNER", p)).toBe(true);
  });

  it("réserve suppression de l'organisation et abonnement au propriétaire", () => {
    for (const role of ROLES.filter((r) => r !== "OWNER")) {
      expect(can(role, "organization:delete")).toBe(false);
      expect(can(role, "subscription:manage")).toBe(false);
    }
  });

  it("limite VIEWER à la lecture, sans IA", () => {
    const perms = [...permissionsFor("VIEWER")];
    expect(perms.every((p) => p.endsWith(":read"))).toBe(true);
    expect(can("VIEWER", "ai:use")).toBe(false);
    expect(can("VIEWER", "stats:read")).toBe(false);
  });

  it("empêche l'employé d'émettre, d'encaisser ou de supprimer", () => {
    for (const p of [
      "invoices:issue",
      "invoices:cancel",
      "invoices:delete",
      "payments:write",
      "members:manage",
      "settings:manage",
      "stats:read",
    ] as const) {
      expect(can("EMPLOYEE", p)).toBe(false);
    }
    expect(can("EMPLOYEE", "invoices:create")).toBe(true);
  });

  it("autorise le comptable à émettre et encaisser, pas à gérer l'organisation", () => {
    expect(can("ACCOUNTANT", "invoices:issue")).toBe(true);
    expect(can("ACCOUNTANT", "payments:write")).toBe(true);
    expect(can("ACCOUNTANT", "members:manage")).toBe(false);
    expect(can("ACCOUNTANT", "organization:manage")).toBe(false);
    expect(can("ACCOUNTANT", "invoices:delete")).toBe(false);
  });

  it("ne contient que des permissions connues", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of ROLES) for (const p of permissionsFor(role)) expect(known.has(p)).toBe(true);
  });
});
