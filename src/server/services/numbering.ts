import "server-only";
import { Prisma } from "@/server/db/client";
import type { TenantDb } from "@/server/db/tenant";

/**
 * Numérotation des devis et factures.
 *
 * - Un compteur par (entreprise, type de document, année de la date du document).
 * - L'incrément (`nextValue = nextValue + 1`) se fait DANS la transaction qui émet le
 *   document : PostgreSQL verrouille la ligne du compteur jusqu'au commit, donc deux
 *   émissions simultanées sont sérialisées. Si l'émission échoue, l'incrément est annulé
 *   avec elle : pas de numéro perdu, numérotation continue.
 * - La contrainte unique (organizationId, number) reste le filet de sécurité final.
 *
 * Préfixe et largeur : repris du compteur le plus récent du même type (personnalisable
 * dans les paramètres), sinon FAC / DEV sur 6 chiffres.
 */
export type DocumentType = "INVOICE" | "QUOTE";

export const DEFAULT_PREFIX: Record<DocumentType, string> = { INVOICE: "FAC", QUOTE: "DEV" };
export const DEFAULT_PADDING = 6;

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

export function formatDocumentNumber(prefix: string, year: number, value: number, padding: number) {
  return `${prefix}-${year}-${String(value).padStart(padding, "0")}`;
}

/** Réserve le prochain numéro. À appeler UNIQUEMENT dans une transaction `ctx.db.$transaction`. */
export async function allocateNumber(
  tx: Tx,
  organizationId: string,
  documentType: DocumentType,
  documentDateISO: string,
): Promise<string> {
  const year = Number(documentDateISO.slice(0, 4));
  const key = { organizationId_documentType_year: { organizationId, documentType, year } };

  const increment = () =>
    tx.documentSequence.update({
      where: key,
      data: { nextValue: { increment: 1 } },
      select: { prefix: true, padding: true, nextValue: true },
    });

  let seq: { prefix: string; padding: number; nextValue: number };
  try {
    seq = await increment();
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025"))
      throw error;
    // Première pièce de l'année : on crée le compteur en reprenant le format le plus récent.
    const latest = await tx.documentSequence.findFirst({
      where: { documentType },
      orderBy: { year: "desc" },
      select: { prefix: true, padding: true },
    });
    // INSERT … ON CONFLICT DO NOTHING : si une autre émission crée le compteur au même
    // instant, pas d'erreur (une erreur annulerait toute la transaction PostgreSQL).
    await tx.documentSequence.createMany({
      data: [
        {
          organizationId,
          documentType,
          year,
          prefix: latest?.prefix ?? DEFAULT_PREFIX[documentType],
          padding: latest?.padding ?? DEFAULT_PADDING,
          nextValue: 1,
        },
      ],
      skipDuplicates: true,
    });
    seq = await increment();
  }

  return formatDocumentNumber(seq.prefix, year, seq.nextValue - 1, seq.padding);
}
