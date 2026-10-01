import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, errorResponse, safeAction, toPublicError } from "@/server/errors";
import { logger } from "@/server/logger";

describe("toPublicError", () => {
  it("transmet tel quel le message d'une AppError", () => {
    const err = toPublicError(new AppError("NOT_FOUND", "Facture introuvable."));
    expect(err).toEqual({ code: "NOT_FOUND", message: "Facture introuvable." });
  });

  it("convertit une ZodError en erreurs par champ", () => {
    const schema = z.object({ email: z.email(), quantity: z.number().positive() });
    const result = schema.safeParse({ email: "x", quantity: -1 });
    const err = toPublicError(result.error);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(err.fieldErrors ?? {})).toEqual(["email", "quantity"]);
  });

  it("masque totalement une erreur inattendue (SQL, stack, secret)", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const raw = new Error('relation "invoices" does not exist — key=sk-secret');
    const err = toPublicError(raw);
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).not.toMatch(/relation|sk-secret/);
    expect(JSON.stringify(err)).not.toContain("stack");
    expect(err.errorId).toMatch(/^[0-9a-f-]{36}$/);
    // Le détail est journalisé côté serveur avec le même identifiant.
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ errorId: err.errorId, err: raw }),
      expect.any(String),
    );
  });
});

describe("safeAction", () => {
  it("retourne ok:true avec la donnée", async () => {
    await expect(safeAction(async () => 42)).resolves.toEqual({ ok: true, data: 42 });
  });

  it("ne lève jamais d'exception et retourne une erreur publique", async () => {
    const res = await safeAction(async () => {
      throw new AppError("FORBIDDEN");
    });
    expect(res).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });
});

describe("errorResponse", () => {
  it("utilise le bon code HTTP et une forme JSON stable", async () => {
    const res = errorResponse(new AppError("RATE_LIMITED"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
