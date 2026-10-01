# Sécurité — FacturDZ AI

## En place (Phase 1)

| Mesure                                                                                               | Où                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------- |
| En-têtes : `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS         | `next.config.ts`       |
| CSP de base : `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | `next.config.ts`       |
| En-tête `X-Powered-By` supprimé                                                                      | `next.config.ts`       |
| Variables d'environnement validées, secrets jamais affichés dans les erreurs                         | `src/server/env.ts`    |
| Secrets masqués dans les logs (mots de passe, jetons, clés, cookies)                                 | `src/server/logger.ts` |
| Erreurs internes jamais exposées (pas de stack, SQL ni secret)                                       | `src/server/errors.ts` |
| Code serveur isolé du bundle client                                                                  | `server-only`          |
| Accès aux secrets, SDK IA et Prisma restreints                                                       | règles ESLint          |

Env, erreurs et masquage des logs sont couverts par `tests/unit/` ; les en-têtes sont vérifiés sur le build de production (test e2e automatisé en Phase 19).

## Prévu

- **Phase 3** : sessions en base, cookies `httpOnly` / `secure` / `SameSite=Lax`,
  hachage des mots de passe, protection CSRF des server actions (vérification d'origine
  native de Next.js).
- **Phase 4** : contexte tenant vérifié à chaque requête, contrôle
  `resource.organizationId === ctx.organizationId`, clés étrangères composites.
- **Phase 18** : CSP stricte avec nonce, rate limiting, journal de sécurité, Row-Level
  Security PostgreSQL (optionnel).

## Règles permanentes

- Un identifiant envoyé par le client ne prouve jamais une autorisation.
- Toute entrée est validée côté serveur avec Zod.
- Toute donnée utilisateur est non fiable, y compris quand elle est transmise à l'IA.
- L'IA ne peut ni écrire en base, ni supprimer, ni accéder à une autre organisation, ni
  lire un secret.
