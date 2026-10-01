/** Fournisseur Gemini contre un faux serveur (aucun appel réseau réel). */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiProvider, MAX_TOOL_ROUNDS, toGeminiSchema } from "@/server/ai/providers/gemini";
import { AppError } from "@/server/errors";

const KEY = "AIza-test-SECRET-KEY";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const usageMetadata = {
  promptTokenCount: 100,
  candidatesTokenCount: 20,
  thoughtsTokenCount: 5,
  cachedContentTokenCount: 40,
};
const ok = (text: string) =>
  reply({ responseId: "r1", candidates: [{ content: { parts: [{ text }] } }], usageMetadata });
const calling = (name: string, args: unknown) =>
  reply({
    responseId: "r2",
    candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args } }] } }],
    usageMetadata,
  });

function make(responses: (Response | Error)[]) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("plus de réponse prévue");
    if (next instanceof Error) throw next;
    return next;
  });
  const provider = new GeminiProvider({
    apiKey: KEY,
    model: "modele-test",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
  });
  return { provider, fetchImpl };
}
type Call = [string, { body: string; headers: Record<string, string> }];
const call = (f: ReturnType<typeof make>["fetchImpl"], i = 0) => f.mock.calls[i] as unknown as Call;
const sent = (f: ReturnType<typeof make>["fetchImpl"], i = 0) => JSON.parse(call(f, i)[1].body);
const req = { system: "SYSTEME", user: "UTILISATEUR" };

describe("requête et sortie structurée", () => {
  it("clé dans l'en-tête (jamais dans l'URL), instruction système séparée, mode JSON", async () => {
    const { provider, fetchImpl } = make([ok('{"action":"CREATE_INVOICE"}')]);
    const r = await provider.generateStructuredOutput({ ...req, maxOutputTokens: 300 }, z.any());
    expect(r.data).toEqual({ action: "CREATE_INVOICE" });
    expect(r.provider).toBe("GEMINI");
    expect(r.providerRequestId).toBe("r1");
    // sortie = candidats + réflexion ; entrée en cache reportée
    expect(r.usage).toEqual({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 25 });
    const [url, init] = call(fetchImpl);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/modele-test:generateContent",
    );
    expect(url).not.toContain(KEY);
    expect(init.headers["x-goog-api-key"]).toBe(KEY);
    const body = sent(fetchImpl);
    expect(body.systemInstruction.parts[0].text).toBe("SYSTEME");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "UTILISATEUR" }] }]);
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      maxOutputTokens: 300,
    });
  });

  it("ajoute le message de correction", async () => {
    const { provider, fetchImpl } = make([ok("{}")]);
    await provider.generateStructuredOutput({ ...req, correction: "CORRIGE" }, z.any());
    expect(sent(fetchImpl).contents.at(-1).parts[0].text).toBe("CORRIGE");
  });

  it("un contenu non JSON est renvoyé tel quel", async () => {
    const { provider } = make([ok("Bonjour")]);
    expect((await provider.generateStructuredOutput(req, z.any())).data).toBe("Bonjour");
  });
});

describe("erreurs, relances et secrets", () => {
  it("relance une fois sur 503", async () => {
    const { provider, fetchImpl } = make([reply({}, 503), ok("ok")]);
    expect((await provider.generateText(req)).data).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("403 : pas de relance, ni clé ni corps divulgués", async () => {
    const { provider, fetchImpl } = make([
      reply({ error: { message: `API key ${KEY} invalid, extrait SECRET-CLIENT` } }, 403),
    ]);
    const error = await provider.generateText(req).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain("SECRET-CLIENT");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("429 persistant → RATE_LIMITED ; réseau persistant → AI_UNAVAILABLE", async () => {
    await expect(
      make([reply({}, 429), reply({}, 429)]).provider.generateText(req),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(
      make([new TypeError("x"), new TypeError("x")]).provider.generateText(req),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});

describe("outils (lecture seule)", () => {
  const tool = (execute = vi.fn(async () => ({ total: "1000.00" }))) => ({
    name: "period_figures",
    description: "chiffres",
    parameters: z.object({ period: z.enum(["THIS_MONTH", "THIS_YEAR"]) }),
    execute,
  });

  it("convertit le schéma sans les mots-clés non pris en charge", () => {
    const s = toGeminiSchema(z.toJSONSchema(z.object({ a: z.string() }))) as Record<
      string,
      unknown
    >;
    expect(s).not.toHaveProperty("$schema");
    expect(s).not.toHaveProperty("additionalProperties");
    expect(s).toMatchObject({ type: "object", properties: { a: { type: "string" } } });
  });

  it("exécute l'outil, renvoie functionResponse puis la réponse finale", async () => {
    const t = tool();
    const { provider, fetchImpl } = make([
      calling("period_figures", { period: "THIS_MONTH" }),
      ok("Vous avez facturé 1 000 DA."),
    ]);
    const r = await provider.generateWithTools(req, [t as never]);
    expect(t.execute).toHaveBeenCalledWith({ period: "THIS_MONTH" });
    expect(r.data.text).toBe("Vous avez facturé 1 000 DA.");
    expect(r.data.calls).toHaveLength(1);
    expect(r.usage.inputTokens).toBe(200);
    const second = sent(fetchImpl, 1).contents;
    expect(second.at(-2).role).toBe("model");
    expect(second.at(-1)).toEqual({
      role: "user",
      parts: [
        {
          functionResponse: { name: "period_figures", response: { result: { total: "1000.00" } } },
        },
      ],
    });
    expect(sent(fetchImpl, 0).tools[0].functionDeclarations[0].name).toBe("period_figures");
  });

  it("n'exécute jamais un outil inconnu ; refuse des arguments invalides", async () => {
    const t = tool();
    const a = make([calling("delete_everything", {}), ok("Non.")]);
    expect((await a.provider.generateWithTools(req, [t as never])).data.calls).toEqual([]);
    const b = make([calling("period_figures", { period: "ALL" }), ok("Non.")]);
    expect((await b.provider.generateWithTools(req, [t as never])).data.calls).toEqual([]);
    expect(t.execute).not.toHaveBeenCalled();
  });

  it("une erreur métier de l'outil interrompt tout", async () => {
    const t = tool(
      vi.fn(async () => {
        throw new AppError("FORBIDDEN");
      }),
    );
    const { provider } = make([calling("period_figures", { period: "THIS_YEAR" })]);
    await expect(provider.generateWithTools(req, [t as never])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("outil sans paramètre : pas de `parameters` envoyé", async () => {
    const t = { name: "overdue", description: "d", parameters: z.object({}), execute: vi.fn() };
    const { provider, fetchImpl } = make([ok("rien")]);
    await provider.generateWithTools(req, [t as never]);
    expect(sent(fetchImpl).tools[0].functionDeclarations[0]).not.toHaveProperty("parameters");
  });

  it("boucle bornée : le dernier tour est sans outils", async () => {
    const t = tool();
    const rs: Response[] = [];
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++)
      rs.push(calling("period_figures", { period: "THIS_YEAR" }));
    rs.push(ok("Fin."));
    const { provider, fetchImpl } = make(rs);
    expect((await provider.generateWithTools(req, [t as never])).data.text).toBe("Fin.");
    expect(sent(fetchImpl, MAX_TOOL_ROUNDS).tools).toBeUndefined();
  });
});
