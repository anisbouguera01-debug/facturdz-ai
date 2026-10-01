/**
 * Applique les migrations Prisma sans le moteur de migration (`schema-engine`),
 * dont le téléchargement est bloqué dans l'environnement de développement cloud.
 *
 * Reproduit le contrat de `prisma migrate deploy` :
 * - table `_prisma_migrations` identique à celle de Prisma ;
 * - checksum = SHA-256 du fichier migration.sql (même calcul que Prisma) ;
 * - migrations appliquées dans l'ordre, chacune dans sa transaction ;
 * - refus si une migration déjà appliquée a été modifiée depuis.
 *
 * Le vrai `prisma migrate deploy` (CI, staging, production) reconnaît donc ces
 * migrations comme appliquées. Utilisation : `pnpm db:migrate:local`.
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import "dotenv/config";
import pg from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  VARCHAR(36)  PRIMARY KEY NOT NULL,
  "checksum"            VARCHAR(64)  NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      VARCHAR(255) NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER      NOT NULL DEFAULT 0
)`;

export async function migrate(databaseUrl: string, log: (msg: string) => void = console.log) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(CREATE_TABLE);
    const { rows } = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
    }>(
      `SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
    );
    const applied = new Map(rows.map((r) => [r.migration_name, r]));

    const names = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter(
        (d) => d.isDirectory() && existsSync(path.join(MIGRATIONS_DIR, d.name, "migration.sql")),
      )
      .map((d) => d.name)
      .sort();

    let count = 0;
    for (const name of names) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = applied.get(name);

      if (existing) {
        if (!existing.finished_at) {
          throw new Error(
            `La migration ${name} a échoué précédemment : intervention manuelle requise.`,
          );
        }
        if (existing.checksum !== checksum) {
          throw new Error(
            `La migration ${name} a été modifiée après application. Créez une nouvelle migration au lieu de modifier celle-ci.`,
          );
        }
        continue;
      }

      const id = randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1, $2, $3, now())`,
          [id, checksum, name],
        );
        await client.query(sql);
        await client.query(
          `UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`,
          [id],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Échec de la migration ${name} : ${(error as Error).message}`, {
          cause: error,
        });
      }
      log(`✔ ${name}`);
      count++;
    }
    log(
      count ? `${count} migration(s) appliquée(s).` : "Base à jour, aucune migration à appliquer.",
    );
  } finally {
    await client.end();
  }
}

/** Supprime et recrée le schéma public (bases de développement et de test uniquement). */
export async function resetDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Réinitialisation refusée : la base n'est pas locale.");
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }
}

// Exécution directe : `tsx scripts/db/migrate.ts [--reset] [--test]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const useTest = process.argv.includes("--test");
  const url = useTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error(useTest ? "TEST_DATABASE_URL manquant" : "DATABASE_URL manquant");
  (async () => {
    if (process.argv.includes("--reset")) {
      await resetDatabase(url);
      console.log("Base réinitialisée.");
    }
    await migrate(url);
  })().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
