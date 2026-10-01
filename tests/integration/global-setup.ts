import "dotenv/config";
import { migrate, resetDatabase } from "../../scripts/db/migrate";
import { verifySchema } from "../../scripts/db/verify-schema";

/** Repart d'une base de test vide, applique les migrations et vérifie l'absence de dérive. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL manquant : les tests d'intégration nécessitent PostgreSQL.");
  }
  await resetDatabase(url);
  await migrate(url, () => {});
  const problems = await verifySchema(url);
  if (problems.length) {
    throw new Error(
      `Les migrations ne correspondent pas au schéma Prisma :\n- ${problems.join("\n- ")}`,
    );
  }
}
