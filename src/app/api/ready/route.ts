import { getDb } from "@/server/db/client";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * Readiness : la base répond. Public mais minimal : aucun détail d'erreur n'est exposé
 * (le détail va dans les logs serveur).
 */
export async function GET() {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ err: error, route: "api/ready" }, "Base de données injoignable");
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
