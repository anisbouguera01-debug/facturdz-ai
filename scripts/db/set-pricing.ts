/**
 * Enregistre un tarif de modèle IA (par million de jetons). Aucune valeur par défaut :
 *   pnpm ai:pricing --provider OPENAI --model <modèle> --input <prix> --output <prix> \
 *     [--cached <prix>] [--currency USD] [--from AAAA-MM-JJ]
 * Les prix sont ceux publiés par le fournisseur à la date d'effet ; à toi de les saisir.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { ZodError } from "zod";
import { setModelPricing } from "../../src/server/ai/pricing-admin";
import { PrismaClient } from "../../src/generated/prisma/client";

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string" },
      model: { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      cached: { type: "string" },
      currency: { type: "string" },
      from: { type: "string" },
    },
  });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const row = await setModelPricing(db as never, {
      provider: values.provider?.toUpperCase() as "OPENAI" | "GEMINI",
      model: values.model ?? "",
      input: values.input ?? "",
      output: values.output ?? "",
      cachedInput: values.cached,
      currency: values.currency ?? "USD",
      effectiveFrom: values.from ?? new Date().toISOString(),
    });
    console.log(
      `Tarif enregistré (${row.provider} ${row.model}, dès ${row.effectiveFrom.toISOString()}).`,
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  if (e instanceof ZodError)
    console.error(e.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join("\n"));
  else console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
