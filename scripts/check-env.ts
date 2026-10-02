/**
 * Valide la configuration d'un environnement AVANT de déployer :
 *   APP_ENV=production DATABASE_URL=… AUTH_SECRET=… … pnpm env:check
 * (les variables viennent de l'environnement du shell ou de la CI, pas d'un fichier committé).
 * N'affiche jamais de valeur ; code de sortie 1 si la configuration est invalide.
 */
import { parseServerEnv } from "../src/server/env";

try {
  const env = parseServerEnv(process.env);
  console.log(
    `✔ Configuration valide (APP_ENV=${env.APP_ENV}, IA=${env.AI_PROVIDER}${env.AI_MODEL ? `/${env.AI_MODEL}` : ""}).`,
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
