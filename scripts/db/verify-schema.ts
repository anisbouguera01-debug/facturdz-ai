/**
 * Vérifie que la base PostgreSQL correspond exactement à prisma/schema.prisma.
 *
 * Remplace localement `prisma migrate diff`, indisponible sans le moteur de
 * migration. La CI exécute en plus le contrôle officiel de Prisma.
 * Compare : enums, tables, colonnes (type, nullabilité, présence d'un défaut),
 * clés primaires, index uniques et simples (colonnes et ordre), clés étrangères
 * (colonnes, cible, ON DELETE). Les contraintes CHECK ne sont pas comparées.
 *
 * Utilisation : `pnpm db:verify` (code de sortie 1 en cas d'écart).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import "dotenv/config";
import pg from "pg";

const require = createRequire(import.meta.url);
const wasm = require("@prisma/prisma-schema-wasm") as { get_dmmf: (p: string) => string };

type Field = {
  name: string;
  kind: "scalar" | "enum" | "object";
  type: string;
  isRequired: boolean;
  isId: boolean;
  hasDefaultValue: boolean;
  default?: unknown;
  isUpdatedAt: boolean;
  nativeType: [string, string[]] | null;
  relationFromFields?: string[];
  relationToFields?: string[];
  relationOnDelete?: string;
};
type Model = {
  name: string;
  dbName: string | null;
  fields: Field[];
  primaryKey: { fields: string[] } | null;
};
type Index = { model: string; type: "id" | "unique" | "normal"; fields: { name: string }[] };
type Dmmf = {
  datamodel: {
    enums: { name: string; values: { name: string }[] }[];
    models: Model[];
    indexes: Index[];
  };
};

const ON_DELETE: Record<string, string> = {
  Cascade: "CASCADE",
  NoAction: "NO ACTION",
  SetNull: "SET NULL",
  Restrict: "RESTRICT",
  SetDefault: "SET DEFAULT",
};

function expectedType(f: Field): string {
  if (f.kind === "enum") return f.type;
  if (f.nativeType?.[0] === "Decimal") return `numeric(${f.nativeType[1].join(",")})`;
  if (f.nativeType?.[0] === "Date") return "date";
  const map: Record<string, string> = {
    String: "text",
    Boolean: "boolean",
    Int: "integer",
    DateTime: "timestamp(3)",
    Json: "jsonb",
    Decimal: "numeric(65,30)",
  };
  return map[f.type] ?? `?${f.type}`;
}

/** Une valeur par défaut existe en base (cuid/uuid sont générés par Prisma, pas par la base). */
function expectsDbDefault(f: Field): boolean {
  if (!f.hasDefaultValue) return false;
  const d = f.default as { name?: string } | undefined;
  return !(d && typeof d === "object" && (d.name === "cuid" || d.name === "uuid"));
}

export async function verifySchema(
  databaseUrl: string,
  schemaPath = "prisma/schema.prisma",
): Promise<string[]> {
  const schema = readFileSync(path.resolve(schemaPath), "utf8");
  const dmmf: Dmmf = JSON.parse(
    wasm.get_dmmf(JSON.stringify({ prismaSchema: [["schema.prisma", schema]] })),
  );
  const { enums, models, indexes } = dmmf.datamodel;
  const tableOf = (m: Model) => m.dbName ?? m.name;
  const modelByName = new Map(models.map((m) => [m.name, m]));
  const problems: string[] = [];

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Enums
    const { rows: enumRows } = await client.query<{ name: string; values: string[] }>(`
      SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS values
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
      GROUP BY t.typname`);
    const dbEnums = new Map(enumRows.map((r) => [r.name, r.values]));
    for (const e of enums) {
      const vals = dbEnums.get(e.name);
      const want = e.values.map((v) => v.name);
      if (!vals) problems.push(`enum ${e.name} absent`);
      else if (vals.join() !== want.join())
        problems.push(`enum ${e.name} : base [${vals}] ≠ schéma [${want}]`);
      dbEnums.delete(e.name);
    }
    for (const extra of dbEnums.keys())
      problems.push(`enum ${extra} présent en base mais absent du schéma`);

    // Colonnes
    const { rows: colRows } = await client.query<{
      table: string;
      column: string;
      type: string;
      nullable: boolean;
      has_default: boolean;
    }>(`
      SELECT c.relname AS table, a.attname AS column,
             format_type(a.atttypid, a.atttypmod) AS type,
             NOT a.attnotnull AS nullable, a.atthasdef AS has_default
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relname <> '_prisma_migrations'`);
    const dbTables = new Map<string, Map<string, (typeof colRows)[number]>>();
    for (const r of colRows) {
      if (!dbTables.has(r.table)) dbTables.set(r.table, new Map());
      dbTables.get(r.table)!.set(r.column, r);
    }

    for (const m of models) {
      const t = tableOf(m);
      const cols = dbTables.get(t);
      if (!cols) {
        problems.push(`table ${t} absente`);
        continue;
      }
      for (const f of m.fields.filter((x) => x.kind !== "object")) {
        const c = cols.get(f.name);
        if (!c) {
          problems.push(`${t}.${f.name} absente`);
          continue;
        }
        const wantType = expectedType(f);
        const gotType = c.type
          .replace(/^"|"$/g, "")
          .replace("timestamp(3) without time zone", "timestamp(3)");
        if (gotType !== wantType) problems.push(`${t}.${f.name} : type ${gotType} ≠ ${wantType}`);
        if (c.nullable === f.isRequired) {
          problems.push(
            `${t}.${f.name} : ${c.nullable ? "nullable" : "NOT NULL"} en base, ${f.isRequired ? "requis" : "optionnel"} dans le schéma`,
          );
        }
        if (c.has_default !== expectsDbDefault(f)) {
          problems.push(
            `${t}.${f.name} : valeur par défaut ${c.has_default ? "présente" : "absente"} en base`,
          );
        }
        cols.delete(f.name);
      }
      for (const extra of cols.keys())
        problems.push(`${t}.${extra} présente en base mais absente du schéma`);
      dbTables.delete(t);
    }
    for (const extra of dbTables.keys())
      problems.push(`table ${extra} présente en base mais absente du schéma`);

    // Index (PK, uniques, simples)
    const { rows: idxRows } = await client.query<{
      table: string;
      name: string;
      unique: boolean;
      primary: boolean;
      columns: string[];
    }>(`
      SELECT t.relname AS table, i.relname AS name, ix.indisunique AS unique, ix.indisprimary AS primary,
             array(SELECT a.attname FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS columns
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
      WHERE t.relname <> '_prisma_migrations'`);
    const dbIdx = new Map(idxRows.map((r) => [r.name, r]));
    for (const i of indexes) {
      const m = modelByName.get(i.model)!;
      const t = tableOf(m);
      const fields = i.fields.map((f) => f.name);
      const name =
        i.type === "id"
          ? `${t}_pkey`
          : `${t}_${fields.join("_")}_${i.type === "unique" ? "key" : "idx"}`.slice(0, 63);
      const got = dbIdx.get(name);
      if (!got) {
        problems.push(`index ${name} absent`);
        continue;
      }
      if (got.columns.join() !== fields.join())
        problems.push(`index ${name} : colonnes [${got.columns}] ≠ [${fields}]`);
      if (got.unique !== (i.type !== "normal")) problems.push(`index ${name} : unicité incorrecte`);
      dbIdx.delete(name);
    }
    for (const extra of dbIdx.keys())
      problems.push(`index ${extra} présent en base mais absent du schéma`);

    // Clés étrangères
    const { rows: fkRows } = await client.query<{
      name: string;
      table: string;
      target: string;
      columns: string[];
      target_columns: string[];
      on_delete: string;
    }>(`
      SELECT con.conname AS name, c.relname AS table, ft.relname AS target,
        array(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS columns,
        array(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord)::text[] AS target_columns,
        CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL'
             WHEN 'r' THEN 'RESTRICT' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_class ft ON ft.oid = con.confrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE con.contype = 'f'`);
    const dbFk = new Map(fkRows.map((r) => [r.name, r]));
    for (const m of models) {
      for (const f of m.fields) {
        if (f.kind !== "object" || !f.relationFromFields?.length) continue;
        const t = tableOf(m);
        const name = `${t}_${f.relationFromFields.join("_")}_fkey`.slice(0, 63);
        const got = dbFk.get(name);
        if (!got) {
          problems.push(`clé étrangère ${name} absente`);
          continue;
        }
        const target = tableOf(modelByName.get(f.type)!);
        const onDelete = ON_DELETE[f.relationOnDelete ?? (f.isRequired ? "Restrict" : "SetNull")];
        if (got.target !== target) problems.push(`${name} : cible ${got.target} ≠ ${target}`);
        if (got.columns.join() !== f.relationFromFields.join())
          problems.push(`${name} : colonnes incorrectes`);
        if (got.target_columns.join() !== (f.relationToFields ?? []).join())
          problems.push(`${name} : colonnes cibles incorrectes`);
        if (got.on_delete !== onDelete)
          problems.push(`${name} : ON DELETE ${got.on_delete} ≠ ${onDelete}`);
        dbFk.delete(name);
      }
    }
    for (const extra of dbFk.keys())
      problems.push(`clé étrangère ${extra} présente en base mais absente du schéma`);
  } finally {
    await client.end();
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const useTest = process.argv.includes("--test");
  const url = useTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!url) throw new Error("URL de base manquante");
  verifySchema(url)
    .then((problems) => {
      if (problems.length) {
        console.error(`✘ ${problems.length} écart(s) entre la base et prisma/schema.prisma :`);
        for (const p of problems) console.error(`  - ${p}`);
        process.exit(1);
      }
      console.log("✔ La base correspond exactement au schéma Prisma.");
    })
    .catch((e) => {
      console.error((e as Error).message);
      process.exit(1);
    });
}
