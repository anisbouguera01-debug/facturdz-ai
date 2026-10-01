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

## Authentification (Phase 3)

Configuration : `src/server/auth/auth.ts` (Better Auth). Tests : `tests/integration/auth.test.ts`.

| Mesure                 | Détail                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mots de passe          | Hachés en scrypt (jamais stockés en clair), 10 à 128 caractères                                                                                     |
| Sessions               | En base, 7 jours, prolongées au plus une fois par jour ; **pas de cache dans le cookie** : suppression ou révocation effective immédiatement        |
| Cookies                | `facturdz.session_token`, `HttpOnly`, `SameSite=Lax`, `Secure` dès que l'URL est en HTTPS                                                           |
| CSRF                   | Requêtes d'authentification refusées (403) si l'origine n'est pas l'application ; server actions protégées par la vérification d'origine de Next.js |
| Anti brute-force       | Stocké en base (`auth_rate_limits`) : 5 connexions/min, 5 inscriptions/10 min, 3 réinitialisations/10 min par IP ; 100 requêtes/min sinon           |
| Escalade de privilèges | `platformRole`, `status`, `activeOrganizationId` non modifiables par l'utilisateur (`input: false`)                                                 |
| Compte suspendu        | Ouverture de session refusée                                                                                                                        |
| Énumération de comptes | Même message à la connexion pour e-mail inconnu, mauvais mot de passe ou compte suspendu                                                            |
| Redirection ouverte    | Paramètre `next` limité aux chemins internes (`src/lib/safe-redirect.ts`)                                                                           |
| Proxy                  | Redirection optimiste sans cookie ; **l'autorisation réelle est vérifiée en base** dans chaque page, action et route                                |

Vérifié en HTTP sur le build de production : redirection sans session, connexion, origine
étrangère refusée (403), blocage après 5 essais (429), déconnexion.

À ajouter avec un fournisseur d'e-mail : vérification d'adresse, réinitialisation du mot de passe.

## Isolation des entreprises (Phase 4)

Détails dans `docs/architecture.md` (Multi-tenant). Tests : `tests/integration/tenant-db.test.ts`,
`tests/integration/tenant-context.test.ts`, `tests/unit/permissions.test.ts`.

- Appartenance revérifiée en base à chaque requête ; une organisation active falsifiée
  dans la session est ignorée et corrigée (vérifié en HTTP sur le build de production).
- Client de données limité à une organisation : lecture, modification, suppression et
  création impossibles hors de l'organisation courante.
- Changement d'organisation refusé si l'utilisateur n'est pas membre, sans révéler si
  l'organisation existe.
- Compte suspendu : accès coupé dès la requête suivante, même avec une session ouverte.
- Journal d'audit (`audit_logs`) : création d'entreprise, changement d'organisation.

## Prévu

- **Phase 18** : CSP stricte avec nonce, rate limiting applicatif (IA, API), journal de
  sécurité, Row-Level Security PostgreSQL (optionnel).

## Règles permanentes

- Un identifiant envoyé par le client ne prouve jamais une autorisation.
- Toute entrée est validée côté serveur avec Zod.
- Toute donnée utilisateur est non fiable, y compris quand elle est transmise à l'IA.
- L'IA ne peut ni écrire en base, ni supprimer, ni accéder à une autre organisation, ni
  lire un secret.
