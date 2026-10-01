import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";

/**
 * Données de session exposables aux composants (DTO minimal : pas de jeton,
 * pas d'IP, pas de user-agent).
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  platformRole: "USER" | "SUPER_ADMIN";
}

export interface CurrentSession {
  user: SessionUser;
  sessionId: string;
  activeOrganizationId: string | null;
}

/**
 * Session de la requête courante, lue en base à chaque requête (pas de cache cookie)
 * et mémorisée pour la durée du rendu grâce à `cache()` de React.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user;
  // Un compte suspendu après sa connexion perd l'accès dès la requête suivante.
  if (u.status === "SUSPENDED") return null;
  return {
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      platformRole: u.platformRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER",
    },
    sessionId: result.session.id,
    activeOrganizationId: result.session.activeOrganizationId ?? null,
  };
});

/** Exige une session valide, sinon redirige vers la connexion. */
export async function requireSession(nextPath?: string): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return session;
}
