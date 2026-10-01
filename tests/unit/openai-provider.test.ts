/** Fournisseur OpenAI contre un faux serveur (aucun appel réseau réel). */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MAX_TOOL_ROUNDS, OpenAIProvider } from "@/server/ai/providers/openai";
import { AppError } from "@/server/errors";

const KEY = "sk-test-SECRET-KEY-123";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (content: string | null, extra: Record<string, unknown> = {}) =>
  reply({
    id: "req_1",
    choices: [{ message: { role: "assistant", content, ...extra } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_tokens_details: { cached_tokens: 40 },
    },
  });

function make(responses: (Response | Error)[]) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("plus de réponse prévue");
    if (next instanceof Error) throw next;
    return next;
  });
  const provider = new OpenAIProvider({
    apiKey: KEY,
    model: "modele-test",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: async () => {},
  });
  return { provider, fetchImpl };
}
const req = { system: "SYSTEME", user: "UTILISATEUR" };
const sent = (f: ReturnType<typeof make>["fetchImpl"], i = 0) =>
  JSON.parse((f.mock.calls[i] as unknown as [string, { body: string }])[1].body);

describe("sortie structurée", () => {
  it("envoie clé, modèle, mode JSON et renvoie la valeur analysée + l'usage", async () => {
    const { provider, fetchImpl } = make([ok('{"action":"CREATE_INVOICE"}')]);
    const r = await provider.generateStructuredOutput({ ...req, maxOutputTokens: 500 }, z.any());
    expect(r.data).toEqual({ action: "CREATE_INVOICE" });
    expect(r.provider).toBe("OPENAI");
    expect(r.providerRequestId).toBe("req_1");
    expect(r.usage).toEqual({ inputTokens: 100, cachedInputTokens: 40, outputTokens: 20 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = sent(fetchImpl);
    expect(body).toMatchObject({
      model: "modele-test",
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });

  it("ajoute le message de correction après la demande", async () => {
    const { provider, fetchImpl } = make([ok("{}")]);
    await provider.generateStructuredOutput({ ...req, correction: "CORRIGE" }, z.any());
    expect(sent(fetchImpl).messages.at(-1)).toEqual({ role: "user", content: "CORRIGE" });
  });

  it("un contenu non JSON est renvoyé tel quel (la validation Zod le rejettera)", async () => {
    const { provider } = make([ok("Voici votre facture !")]);
    const r = await provider.generateStructuredOutput(req, z.any());
    expect(r.data).toBe("Voici votre facture !");
  });
});

describe("erreurs, relances et secrets", () => {
  it("relance une fois sur 503 puis réussit", async () => {
    const { provider, fetchImpl } = make([reply({}, 503), ok("{}")]);
    await provider.generateStructuredOutput(req, z.any());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("ne relance pas sur 401 et ne divulgue ni clé ni corps", async () => {
    const { provider, fetchImpl } = make([
      reply({ error: { message: `Incorrect API key ${KEY} et extrait SECRET-CLIENT` } }, 401),
    ]);
    const error = await provider.generateText(req).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("AI_UNAVAILABLE");
    expect(String(error.message)).not.toContain(KEY);
    expect(String(error.message)).not.toContain("SECRET-CLIENT");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("429 persistant → RATE_LIMITED après une relance", async () => {
    const { provider, fetchImpl } = make([reply({}, 429), reply({}, 429)]);
    await expect(provider.generateText(req)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("erreur réseau persistante → AI_UNAVAILABLE", async () => {
    const { provider } = make([new TypeError("fetch failed"), new TypeError("fetch failed")]);
    await expect(provider.generateText(req)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("transmet un délai maximal à chaque appel", async () => {
    const { provider, fetchImpl } = make([ok("x")]);
    await provider.generateText(req);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("outils (lecture seule)", () => {
  const toolCall = (name: string, args: unknown, id = "c1") =>
    ok(null, {
      tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
    });
  const tool = (execute = vi.fn(async () => ({ total: "1000.00" }))) => ({
    name: "period_figures",
    description: "chiffres",
    parameters: z.object({ period: z.enum(["THIS_MONTH", "THIS_YEAR"]) }),
    execute,
  });

  it("exécute l'outil demandé, renvoie le résultat au modèle puis la réponse finale", async () => {
    const t = tool();
    const { provider, fetchImpl } = make([
      toolCall("period_figures", { period: "THIS_MONTH" }),
      ok("Vous avez facturé 1 000 DA."),
    ]);
    const r = await provider.generateWithTools(req, [t as never]);
    expect(t.execute).toHaveBeenCalledWith({ period: "THIS_MONTH" });
    expect(r.data.text).toBe("Vous avez facturé 1 000 DA.");
    expect(r.data.calls).toEqual([
      { tool: "period_figures", args: { period: "THIS_MONTH" }, result: { total: "1000.00" } },
    ]);
    expect(r.usage.inputTokens).toBe(200); // cumul des deux appels
    const second = sent(fetchImpl, 1);
    expect(second.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(sent(fetchImpl, 0).tools[0].function.name).toBe("period_figures");
  });

  it("n'exécute jamais un outil inconnu", async () => {
    const t = tool();
    const { provider } = make([toolCall("delete_everything", {}), ok("Impossible.")]);
    const r = await provider.generateWithTools(req, [t as never]);
    expect(t.execute).not.toHaveBeenCalled();
    expect(r.data.calls).toEqual([]);
  });

  it("refuse des arguments invalides (pas d'exécution)", async () => {
    const t = tool();
    const { provider } = make([
      toolCall("period_figures", { period: "ALL", organizationId: "autre" }),
      ok("Désolé."),
    ]);
    const r = await provider.generateWithTools(req, [t as never]);
    expect(t.execute).not.toHaveBeenCalled();
    expect(r.data.calls).toEqual([]);
  });

  it("une erreur métier de l'outil (ex. permission) interrompt tout", async () => {
    const t = tool(
      vi.fn(async () => {
        throw new AppError("FORBIDDEN");
      }),
    );
    const { provider } = make([toolCall("period_figures", { period: "THIS_YEAR" })]);
    await expect(provider.generateWithTools(req, [t as never])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("la boucle est bornée : après MAX_TOOL_ROUNDS tours, plus d'outils proposés", async () => {
    const t = tool();
    const responses: Response[] = [];
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++)
      responses.push(toolCall("period_figures", { period: "THIS_YEAR" }, `c${i}`));
    responses.push(ok("Fin."));
    const { provider, fetchImpl } = make(responses);
    const r = await provider.generateWithTools(req, [t as never]);
    expect(r.data.text).toBe("Fin.");
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
    expect(sent(fetchImpl, MAX_TOOL_ROUNDS).tools).toBeUndefined();
  });
});
