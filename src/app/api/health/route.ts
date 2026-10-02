export const dynamic = "force-dynamic";

/** Liveness : le processus répond. Public, sans accès base ni donnée (pour l'orchestrateur). */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
