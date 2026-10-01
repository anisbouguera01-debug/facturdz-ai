import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/safe-redirect";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

describe("safeRedirect", () => {
  it.each([
    ["/invoices", "/invoices"],
    ["/invoices?status=PAID#top", "/invoices?status=PAID#top"],
  ])("accepte le chemin interne %s", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/\u0000x",
    "",
    null,
    undefined,
  ])("refuse la destination externe ou invalide %s", (input) => {
    expect(safeRedirect(input as string)).toBe("/dashboard");
  });
});

describe("schémas d'authentification", () => {
  it("normalise l'adresse e-mail en minuscules et sans espaces", () => {
    const r = loginSchema.parse({ email: "  Anis@Exemple.DZ ", password: "x" });
    expect(r.email).toBe("anis@exemple.dz");
  });

  it("exige 10 caractères minimum à l'inscription", () => {
    const r = registerSchema.safeParse({
      firstName: "A",
      lastName: "B",
      email: "a@b.dz",
      password: "123456789",
    });
    expect(r.success).toBe(false);
  });
});

describe("messages d'erreur d'authentification", () => {
  it("ne révèle pas à la connexion si l'adresse existe", async () => {
    const { authErrorMessage } = await import("@/lib/auth-errors");
    const messages = new Set(
      [
        { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
        { status: 401, code: "USER_NOT_FOUND" },
        { status: 400, code: "FAILED_TO_CREATE_SESSION" },
      ].map((e) => authErrorMessage(e, "login")),
    );
    expect(messages.size).toBe(1);
  });

  it("signale clairement le blocage anti brute-force", async () => {
    const { authErrorMessage } = await import("@/lib/auth-errors");
    expect(authErrorMessage({ status: 429 }, "login")).toMatch(/Trop de tentatives/);
  });
});
