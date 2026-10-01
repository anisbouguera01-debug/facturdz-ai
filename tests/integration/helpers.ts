import { createPrismaClient, type Db } from "@/server/db/client";

let db: Db | undefined;

/** Client Prisma connecté à la base de test. */
export function testDb(): Db {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL manquant");
  db ??= createPrismaClient(url);
  return db;
}

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Crée une organisation isolée avec un client et un produit. */
export async function createOrgFixture(name = "Org") {
  const id = uid();
  const org = await testDb().organization.create({
    data: { name: `${name} ${id}`, slug: `${name.toLowerCase()}-${id}` },
  });
  const customer = await testDb().customer.create({
    data: { organizationId: org.id, name: `Client ${id}` },
  });
  const product = await testDb().product.create({
    data: { organizationId: org.id, name: `Produit ${id}`, priceHT: "1000", vatRate: "19" },
  });
  return { org, customer, product };
}
