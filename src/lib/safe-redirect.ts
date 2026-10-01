/**
 * Valide une destination de redirection après connexion.
 * N'accepte qu'un chemin interne (« /… ») : bloque les redirections ouvertes
 * vers un autre site (« //evil.com », « https://… », « /\evil.com »).
 */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  if (!target || typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\"))
    return fallback;
  if (/[\u0000-\u001f]/.test(target)) return fallback;
  try {
    const url = new URL(target, "http://facturdz.local");
    if (url.origin !== "http://facturdz.local") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
