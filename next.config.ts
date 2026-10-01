import type { NextConfig } from "next";

/**
 * En-têtes de sécurité appliqués à toutes les routes.
 * La CSP stricte avec nonce (script-src) sera ajoutée en Phase 18 via le proxy ;
 * ici on pose une CSP de base qui ne casse rien mais bloque le clickjacking,
 * les plugins et les détournements de <base>/<form>.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Ignoré en HTTP local ; actif derrière HTTPS en staging/production.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // pino (workers Node) et pdfkit (fichiers de données) restent hors du bundle serveur.
  serverExternalPackages: ["pino", "pino-pretty", "pdfkit"],
  // Polices embarquées dans les PDF : à inclure dans le déploiement (lues au rendu).
  outputFileTracingIncludes: { "/**/pdf": ["./src/server/pdf/fonts/**"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
