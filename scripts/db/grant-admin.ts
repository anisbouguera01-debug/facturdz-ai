/**
 * Attribue ou retire le rôle d'administrateur de la plateforme (SUPER_ADMIN).
 *   pnpm admin:grant --email <adresse>            # attribuer
 *   pnpm admin:grant --email <adresse> --revoke   # retirer
 * C'est la SEULE voie d'attribution : jamais depuis l'application ni à l'inscription.
 * Le compte doit exister et être actif. L'opération est inscrite au journal d'activité.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, revoke: { type: "boolean", default: false } },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email) throw new Error("Usage : pnpm admin:grant --email <adresse> [--revoke]");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Aucun compte pour ${email}.`);
    if (!values.revoke && user.status !== "ACTIVE")
      throw new Error("Ce compte n'est pas actif : il ne peut pas devenir administrateur.");
    const role = values.revoke ? "USER" : "SUPER_ADMIN";
    await db.user.update({ where: { id: user.id }, data: { platformRole: role } });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: values.revoke ? "admin.role_revoked" : "admin.role_granted",
        entity: "User",
        entityId: user.id,
        metadata: { via: "cli" },
      },
    });
    console.log(`${email} : rôle plateforme = ${role}.`);
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
