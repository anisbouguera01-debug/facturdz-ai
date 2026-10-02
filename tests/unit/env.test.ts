import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/server/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/facturdz",
  AUTH_SECRET: "x".repeat(32),
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("accepte une configuration minimale et applique les valeurs par défaut", () => {
    const env = parseServerEnv(valid);
    expect(env.AI_PROVIDER).toBe("openai");
    expect(env.APP_ENV).toBe("development");
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("traite les valeurs vides (KEY=) comme absentes", () => {
    const env = parseServerEnv({ ...valid, OPENAI_API_KEY: "", AI_MODEL: "" });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.AI_MODEL).toBeUndefined();
  });

  it("refuse un AUTH_SECRET trop court", () => {
    expect(() => parseServerEnv({ ...valid, AUTH_SECRET: "court" })).toThrow(/AUTH_SECRET/);
  });

  it("refuse une URL de base non PostgreSQL", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "mysql://u:p@h/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("refuse un fournisseur IA inconnu", () => {
    expect(() => parseServerEnv({ ...valid, AI_PROVIDER: "autre" })).toThrow(/AI_PROVIDER/);
  });

  it("refuse le fournisseur simulé en production, l'accepte en développement", () => {
    expect(() => parseServerEnv({ ...valid, AI_PROVIDER: "mock", APP_ENV: "production" })).toThrow(
      /mock/,
    );
    expect(parseServerEnv({ ...valid, AI_PROVIDER: "mock" }).AI_PROVIDER).toBe("mock");
  });

  it("ne révèle jamais la valeur d'un secret dans le message d'erreur", () => {
    const secret = "sk-ne-doit-jamais-apparaitre";
    try {
      parseServerEnv({ ...valid, AUTH_SECRET: secret.slice(0, 10), OPENAI_API_KEY: secret });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain(secret.slice(0, 10));
      expect(String(e)).not.toContain(secret);
    }
  });
});

describe("staging et production (configuration stricte)", () => {
  const prod = {
    APP_ENV: "production",
    DATABASE_URL: "postgresql://u:p@db.example-host.net:5432/facturdz",
    AUTH_SECRET: "k9Xr2vQm7LpZ4tWb8NcY1eHd6SaFgJu3",
    NEXT_PUBLIC_APP_URL: "https://app.facturdz.example",
    AI_PROVIDER: "openai",
    AI_MODEL: "un-modele",
    OPENAI_API_KEY: "cle-reelle",
  };

  it("accepte une configuration complète", () => {
    expect(parseServerEnv(prod).APP_ENV).toBe("production");
  });

  it.each([
    ["URL en http", { NEXT_PUBLIC_APP_URL: "http://app.facturdz.example" }, /NEXT_PUBLIC_APP_URL/],
    ["secret d'exemple", { AUTH_SECRET: "change-me-change-me-change-me-change" }, /AUTH_SECRET/],
    ["secret répétitif", { AUTH_SECRET: "a".repeat(40) }, /AUTH_SECRET/],
    ["modèle IA absent", { AI_MODEL: "" }, /AI_MODEL/],
    ["clé OpenAI absente", { OPENAI_API_KEY: "" }, /OPENAI_API_KEY/],
    ["base locale", { DATABASE_URL: "postgresql://u:p@localhost:5432/x" }, /DATABASE_URL/],
    ["mock", { AI_PROVIDER: "mock" }, /AI_PROVIDER/],
  ])("refuse : %s", (_name, override, pattern) => {
    expect(() => parseServerEnv({ ...prod, ...override })).toThrow(pattern);
  });

  it("exige la clé Gemini avec gemini, et applique les mêmes règles en staging", () => {
    const g = { ...prod, AI_PROVIDER: "gemini", OPENAI_API_KEY: "", GEMINI_API_KEY: "" };
    expect(() => parseServerEnv(g)).toThrow(/GEMINI_API_KEY/);
    expect(() => parseServerEnv({ ...prod, APP_ENV: "staging", AI_MODEL: "" })).toThrow(/AI_MODEL/);
  });

  it("n'impose rien en développement", () => {
    expect(parseServerEnv(valid).APP_ENV).toBe("development");
  });
});
