"use client";

import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "@/server/auth/auth";

/**
 * Client Better Auth pour les composants navigateur (même origine, /api/auth).
 * `import type` : seul le type de la config serveur est utilisé, aucun code serveur
 * n'est embarqué dans le bundle client.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});
