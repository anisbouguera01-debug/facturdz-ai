import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
vi.mock("@/server/env", () => ({ serverEnv: () => env.current }));

import { getProvider } from "@/server/ai/providers";

describe("choix du fournisseur", () => {
  beforeEach(() => {
    env.current = {};
  });
  it("openai sans clé ou sans modèle : indisponible, sans détail", () => {
    env.current = { AI_PROVIDER: "openai", AI_MODEL: "m" };
    expect(() => getProvider()).toThrow(/pas configuré/);
    env.current = { AI_PROVIDER: "openai", OPENAI_API_KEY: "k" };
    expect(() => getProvider()).toThrow(/pas configuré/);
  });
  it("gemini sans clé ou sans modèle : indisponible", () => {
    env.current = { AI_PROVIDER: "gemini", AI_MODEL: "m" };
    expect(() => getProvider()).toThrow(/pas configuré/);
  });
  it("instancie le bon fournisseur", () => {
    env.current = { AI_PROVIDER: "openai", OPENAI_API_KEY: "k", AI_MODEL: "m" };
    expect(getProvider().id).toBe("OPENAI");
    env.current = { AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", AI_MODEL: "m" };
    expect(getProvider().id).toBe("GEMINI");
    env.current = { AI_PROVIDER: "mock" };
    expect(getProvider().id).toBe("MOCK");
  });
});
