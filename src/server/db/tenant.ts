import "server-only";
import type { Db } from "./client";

/**
 * Client Prisma restreint à UNE organisation (deuxième niveau de défense multi-tenant).
 *
 * Pour chaque modèle « tenant » (portant organizationId) :
 * - lectures, comptages, agrégats, mises à jour et suppressions : `organizationId`
 *   est ajouté au filtre (y compris pour findUnique/update/delete, grâce au
 *   « extended where unique » de Prisma) ;
 * - créations : `organizationId` est imposé ; une valeur différente est refusée ;
 * - modifications : changer `organizationId` est refusé.
 * Un enregistrement d'une autre organisation est donc introuvable (null / P2025),
 * jamais lisible ni modifiable.
 *
 * `organization` n'est accessible qu'en lecture/mise à jour de l'organisation courante.
 * Les modèles globaux (utilisateurs, sessions, plans, tarifs IA…) sont refusés :
 * les services qui en ont besoin utilisent explicitement le client global.
 *
 * Limites connues : les écritures imbriquées (`create: { items: { create: [...] } }`)
 * ne sont pas réécrites ; elles sont protégées par les clés étrangères composites
 * (id, organizationId) de la base. Les requêtes SQL brutes ne doivent pas être
 * utilisées sur ce client.
 */
export const TENANT_MODELS = new Set([
  "OrganizationMember",
  "TaxRate",
  "Customer",
  "Product",
  "DocumentSequence",
  "Quote",
  "QuoteItem",
  "Invoice",
  "InvoiceItem",
  "Payment",
  "Subscription",
  "AIUsage",
  "AIDraft",
  "AuditLog",
]);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const ORG_ALLOWED_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "update",
]);

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

type Args = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

function withOrgData(
  data: unknown,
  organizationId: string,
  model: string,
): Record<string, unknown> {
  const d = { ...(data as Record<string, unknown>) };
  if (d.organizationId !== undefined && d.organizationId !== organizationId) {
    throw new TenantScopeError(`${model} : organizationId différent de l'organisation courante`);
  }
  // Une relation `organization: { connect }` contournerait l'injection : interdite.
  if ("organization" in d) {
    throw new TenantScopeError(`${model} : la relation organization ne peut pas être fournie`);
  }
  d.organizationId = organizationId;
  return d;
}

function assertNoOrgChange(data: unknown, model: string) {
  const d = data as Record<string, unknown> | undefined;
  if (d && ("organizationId" in d || "organization" in d)) {
    throw new TenantScopeError(`${model} : changement d'organisation interdit`);
  }
}

/**
 * Ajoute un filtre en ET avec celui de l'appelant (jamais en remplacement) :
 * un filtre contradictoire (ex. organizationId d'une autre organisation) ne renvoie rien,
 * au lieu de renvoyer silencieusement les données de l'organisation courante.
 */
function andWhere(where: Record<string, unknown> | undefined, filter: Record<string, unknown>) {
  const existing = where?.AND;
  const and = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
  return { ...where, AND: [...and, filter] };
}

export function scopeArgs(
  model: string,
  operation: string,
  args: Args,
  organizationId: string,
): Args {
  if (model === "Organization") {
    if (!ORG_ALLOWED_OPS.has(operation)) {
      throw new TenantScopeError(`Organization.${operation} interdit via le client tenant`);
    }
    if (operation === "update") assertNoOrgChange(args.data, model);
    return { ...args, where: andWhere(args.where, { id: organizationId }) };
  }

  if (!TENANT_MODELS.has(model)) {
    throw new TenantScopeError(`Le modèle ${model} n'est pas accessible via le client tenant`);
  }

  if (WHERE_OPS.has(operation)) {
    if (operation.startsWith("update")) assertNoOrgChange(args.data, model);
    return { ...args, where: andWhere(args.where, { organizationId }) };
  }

  if (CREATE_OPS.has(operation)) {
    const data = Array.isArray(args.data)
      ? args.data.map((d) => withOrgData(d, organizationId, model))
      : withOrgData(args.data, organizationId, model);
    return { ...args, data };
  }

  if (operation === "upsert") {
    assertNoOrgChange(args.update, model);
    return {
      ...args,
      where: andWhere(args.where, { organizationId }),
      create: withOrgData(args.create, organizationId, model),
    };
  }

  throw new TenantScopeError(
    `Opération ${model}.${operation} non prise en charge par le client tenant`,
  );
}

/** Retourne un client Prisma qui ne voit et ne modifie que l'organisation donnée. */
export function forTenant(db: Db, organizationId: string) {
  if (!organizationId) throw new TenantScopeError("organizationId manquant");
  return db.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as Args, organizationId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof forTenant>;
