/**
 * Content-Security-Policy stricte, générée par requête avec un nonce (voir src/proxy.ts).
 *
 * - `script-src` : uniquement 'self' + nonce + 'strict-dynamic' ; aucun script inline ni `eval`
 *   en production (`'unsafe-eval'` seulement en développement, requis par le rechargement à chaud).
 * - `style-src` autorise 'unsafe-inline' : Next.js et les composants injectent des attributs
 *   `style` que les nonces ne couvrent pas. Compromis assumé (le risque d'une injection de CSS
 *   est bien plus faible que celui d'un script) ; à resserrer si Next.js le permet.
 * - Pas de ressource tierce : images/polices/connexions limitées à l'origine (les appels aux
 *   fournisseurs IA se font côté serveur, jamais depuis le navigateur).
 */
export function buildCsp(nonce: string, { dev = false }: { dev?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : [])],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Nonce aléatoire (128 bits) encodé en base64, compatible runtime Edge/Node. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
