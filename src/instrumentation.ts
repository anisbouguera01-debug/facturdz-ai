/**
 * Démarrage du serveur : valide l'environnement tout de suite (échec franc au lancement plutôt
 * qu'à la première requête d'un utilisateur). Les valeurs ne sont jamais affichées.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { serverEnv } = await import("@/server/env");
  serverEnv();
}
