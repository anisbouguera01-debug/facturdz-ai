/**
 * Essai RÉEL des fournisseurs d'IA (OpenAI / Gemini) avec de vraies clés, côté serveur uniquement.
 *
 *   OPENAI_API_KEY=sk-… pnpm ai:live --provider openai --model <modèle> [--input <prix/M> --output <prix/M>]
 *   GEMINI_API_KEY=…    pnpm ai:live --provider gemini --model <modèle> [--input … --output …]
 *
 * Ce que le script vérifie (rien n'est supposé : chaque ligne est un contrôle) :
 *   1. texte simple            → réponse non vide, jetons d'entrée/sortie > 0, latence
 *   2. sortie structurée       → JSON valide selon un schéma Zod
 *   3. boucle d'outils         → l'outil en lecture seule est réellement appelé, jetons cumulés
 *   4. coût estimé             → calcul Decimal avec les prix passés en option (jamais de prix codé)
 *   5. erreur de clé           → une clé invalide donne une erreur générique SANS fuite de la clé
 *   6. délai dépassé           → un timeout de 1 ms est signalé proprement, sans blocage
 * Sans clé : « NON EXÉCUTÉ » (code 0), ou code 2 avec --require. Aucune donnée réelle n'est envoyée :
 * seuls des textes de test. La clé n'est jamais affichée ni écrite.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { computeCost } from "../src/server/ai/cost";
import { GeminiProvider } from "../src/server/ai/providers/gemini";
import { OpenAIProvider } from "../src/server/ai/providers/openai";
import type { AIProvider } from "../src/server/ai/types";

const { values } = parseArgs({
  options: {
    provider: { type: "string" },
    model: { type: "string" },
    input: { type: "string" },
    output: { type: "string" },
    require: { type: "boolean", default: false },
    // Auto-test du script contre un faux serveur local (jamais utilisé avec une vraie clé).
    "base-url": { type: "string" },
  },
});

const providerName = (values.provider ?? "").toLowerCase();
const model = values.model ?? process.env.AI_MODEL ?? "";
const key =
  providerName === "openai"
    ? process.env.OPENAI_API_KEY
    : providerName === "gemini"
      ? process.env.GEMINI_API_KEY
      : undefined;

if (!["openai", "gemini"].includes(providerName)) {
  console.error("Usage : pnpm ai:live --provider openai|gemini --model <modèle>");
  process.exit(1);
}
if (!key || !model) {
  console.log(
    `NON EXÉCUTÉ : ${providerName === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"} et --model (ou AI_MODEL) sont requis.\n` +
      "Aucun essai réel n'a eu lieu : le fournisseur reste NON VÉRIFIÉ.",
  );
  process.exit(values.require ? 2 : 0);
}

const make = (k: string, timeoutMs?: number): AIProvider =>
  providerName === "openai"
    ? new OpenAIProvider({ apiKey: k, model, timeoutMs, baseUrl: values["base-url"] })
    : new GeminiProvider({ apiKey: k, model, timeoutMs, baseUrl: values["base-url"] });

let failed = 0;
const ok = (name: string, detail = "") => console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`);
const ko = (name: string, detail: string) => {
  failed++;
  console.log(`  ✘ ${name} — ${detail}`);
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function timed<T>(fn: () => Promise<T>) {
  const t = Date.now();
  const r = await fn();
  return { r, ms: Date.now() - t };
}

async function main() {
  console.log(`Essai réel : ${providerName} / ${model}`);
  const p = make(key!);
  let totals = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  const add = (u: typeof totals) => {
    totals = {
      inputTokens: totals.inputTokens + u.inputTokens,
      cachedInputTokens: totals.cachedInputTokens + u.cachedInputTokens,
      outputTokens: totals.outputTokens + u.outputTokens,
    };
  };

  // 1. texte
  try {
    const { r, ms } = await timed(() =>
      p.generateText({
        system: "Tu réponds en une seule phrase courte, en français.",
        user: "Dis simplement : bonjour.",
        maxOutputTokens: 50,
      }),
    );
    add(r.usage);
    if (!r.data.trim()) ko("texte", "réponse vide");
    else if (r.usage.inputTokens <= 0 || r.usage.outputTokens <= 0)
      ko("texte", `jetons non rapportés (${JSON.stringify(r.usage)})`);
    else
      ok(
        "texte",
        `${r.usage.inputTokens} jetons entrée / ${r.usage.outputTokens} sortie, ${ms} ms, requête ${r.providerRequestId ?? "n/a"}`,
      );
  } catch (e) {
    ko("texte", msg(e));
  }

  // 2. sortie structurée
  try {
    const schema = z.object({ ville: z.string().min(1), pays: z.string().min(1) });
    const { r, ms } = await timed(() =>
      p.generateStructuredOutput(
        {
          system: 'Réponds uniquement par un objet JSON {"ville": string, "pays": string}.',
          user: "La capitale de l'Algérie.",
          maxOutputTokens: 100,
        },
        schema,
        { name: "capitale" },
      ),
    );
    add(r.usage);
    const parsed = schema.safeParse(r.data);
    if (parsed.success) ok("sortie structurée", `${JSON.stringify(parsed.data)} (${ms} ms)`);
    else ko("sortie structurée", "JSON non conforme au schéma");
  } catch (e) {
    ko("sortie structurée", msg(e));
  }

  // 3. outils
  try {
    let called = 0;
    const tool = {
      name: "lire_chiffre",
      description: "Renvoie le chiffre d'affaires de test. À appeler pour connaître la valeur.",
      parameters: z.object({ periode: z.string().optional() }),
      execute: async () => {
        called++;
        return { chiffre_affaires: "12345.00" };
      },
    };
    const { r, ms } = await timed(() =>
      p.generateWithTools(
        {
          system: "Tu dois appeler l'outil lire_chiffre puis répondre en citant la valeur.",
          user: "Quel est le chiffre d'affaires ?",
          maxOutputTokens: 200,
        },
        [tool],
      ),
    );
    add(r.usage);
    if (called < 1) ko("outils", "l'outil n'a jamais été appelé");
    else ok("outils", `${called} appel(s), ${r.data.calls.length} enregistré(s), ${ms} ms`);
  } catch (e) {
    ko("outils", msg(e));
  }

  // 4. coût
  if (values.input && values.output) {
    const cost = computeCost(totals, {
      id: "live",
      inputCostPerMillionTokens: values.input,
      outputCostPerMillionTokens: values.output,
      cachedInputCostPerMillionTokens: null,
      currency: "USD",
    });
    ok(
      "coût estimé",
      `${cost} USD pour ${totals.inputTokens} entrée / ${totals.outputTokens} sortie (à comparer à la console du fournisseur)`,
    );
  } else {
    console.log("  • coût estimé : non calculé (--input et --output absents ; aucun prix codé)");
  }

  // 5. clé invalide
  const bad = "invalid-key-0123456789abcdef";
  try {
    await make(bad).generateText({ system: "x", user: "x", maxOutputTokens: 5 });
    ko("clé invalide", "aucune erreur alors que la clé est fausse");
  } catch (e) {
    const m = msg(e);
    if (m.includes(bad) || m.includes(key!)) ko("clé invalide", "la clé apparaît dans l'erreur !");
    else ok("clé invalide", `erreur générique : « ${m} »`);
  }

  // 6. délai dépassé
  try {
    const { ms } = await timed(() =>
      make(key!, 1)
        .generateText({ system: "x", user: "x", maxOutputTokens: 5 })
        .then(
          () => {
            throw new Error("pas de timeout");
          },
          (e) => {
            if (msg(e) === "pas de timeout") throw e;
          },
        ),
    );
    ok("timeout", `signalé en ${ms} ms, sans blocage`);
  } catch (e) {
    ko("timeout", msg(e));
  }

  console.log(failed ? `\n${failed} contrôle(s) en échec.` : "\nTous les contrôles réussissent.");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(msg(e));
  process.exit(1);
});
