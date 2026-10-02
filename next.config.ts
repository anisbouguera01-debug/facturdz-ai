import type { NextConfig } from "next";

/**
 * En-têtes de sécurité appliqués à toutes les routes.
 * La CSP (avec nonce par requête) est posée par src/proxy.ts (voir src/lib/csp.ts) ;
 * ici, les en-têtes statiques applicables à toutes les réponses, PDF compris.
 */
const securityHeaders = [
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
  // Image Docker autonome (Dockerfile) : `NEXT_OUTPUT=standalone`. Sans effet sur Vercel.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
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
