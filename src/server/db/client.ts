import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/server/env";

/**
 * Client Prisma unique de l'application.
 *
 * - Prisma 7 + adaptateur `pg` : pas de moteur natif à l'exécution (compatible serverless).
 * - Instancié paresseusement : importer ce module ne lit pas la configuration.
 * - Le client est conservé sur `globalThis` : une seule instance par processus, y
 *   compris après un rechargement à chaud en développement (sinon chaque
 *   modification ouvrirait un nouveau pool de connexions).
 *
 * IMPORTANT : ce client voit toutes les organisations. Le code métier ne l'utilise
 * jamais directement : il passe par les repositories tenant-scopés (Phase 4).
 */
export function createPrismaClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type Db = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { __facturdzPrisma?: Db };

export function getDb(): Db {
  globalForPrisma.__facturdzPrisma ??= createPrismaClient(serverEnv().DATABASE_URL);
  return globalForPrisma.__facturdzPrisma;
}

export { Prisma } from "@/generated/prisma/client";
