import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Vérification OPTIMISTE uniquement : si aucun cookie de session n'est présent,
 * on redirige tout de suite vers la connexion (évite de rendre une page protégée
 * pour rien). Ce n'est PAS un contrôle d'autorisation : la session est vérifiée
 * en base dans chaque page, server action et route (src/server/auth/session.ts).
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(getSessionCookie(request, { cookiePrefix: "facturdz" }));
  if (!hasSessionCookie) {
    const { pathname, search } = request.nextUrl;
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/invoices/:path*",
    "/quotes/:path*",
    "/customers/:path*",
    "/products/:path*",
    "/payments/:path*",
    "/ai/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
