import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce } from "@/lib/csp";

/**
 * Deux rôles, tous deux « optimistes » côté accès :
 *
 * 1. CSP avec nonce, sur toutes les pages (les scripts de Next.js reçoivent automatiquement le
 *    nonce lu dans l'en-tête de requête ; le layout racine rend donc les pages dynamiques).
 *    Les routes PDF sont exclues : un document PDF n'exécute pas de script et certains lecteurs
 *    intégrés se bloquent sous une CSP restrictive (leurs autres en-têtes de sécurité restent).
 * 2. Pour les sections protégées : sans cookie de session, redirection vers la connexion. Ce
 *    n'est PAS un contrôle d'autorisation : la session est vérifiée en base dans chaque page,
 *    server action et route (src/server/auth/session.ts).
 */
const PROTECTED = [
  "/dashboard",
  "/onboarding",
  "/invoices",
  "/quotes",
  "/customers",
  "/products",
  "/payments",
  "/ai",
  "/reports",
  "/settings",
  "/admin",
];

const isProtected = (path: string) => PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isProtected(pathname) && !getSessionCookie(request, { cookiePrefix: "facturdz" })) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (pathname.endsWith("/pdf")) return NextResponse.next();

  const nonce = generateNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
