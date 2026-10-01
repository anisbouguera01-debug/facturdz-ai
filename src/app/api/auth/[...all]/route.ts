import { errorResponse } from "@/server/errors";
import { getAuth } from "@/server/auth/auth";

/**
 * Point d'entrée HTTP de Better Auth (/api/auth/*).
 * L'instance est créée à la première requête, pas à l'import : le build
 * n'exige donc pas les variables d'environnement.
 */
async function handle(request: Request) {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    return errorResponse(error, { route: "api/auth" });
  }
}

export { handle as GET, handle as POST };
