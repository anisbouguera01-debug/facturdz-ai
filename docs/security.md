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

## Server actions (vérifié en Phase 5)

Les server actions sont des points d'entrée HTTP publics : elles ont été appelées
directement (en-tête `Next-Action`, sans passer par l'interface) sur le build de production.

- Rôle lecture seule : création refusée (FORBIDDEN), rien écrit en base.
- Propriétaire d'une autre entreprise visant un client de la démo : modification,
  archivage et suppression refusés (NOT_FOUND), pages en 404, données intactes.
- Origine étrangère : requête rejetée par Next.js, rien écrit.
- Sans session : redirection vers la connexion avant l'action.

## Prévu

- **Phase 18** : CSP stricte avec nonce, rate limiting applicatif (IA, API), journal de
  sécurité, Row-Level Security PostgreSQL (optionnel).

## Règles permanentes

- Un identifiant envoyé par le client ne prouve jamais une autorisation.
- Toute entrée est validée côté serveur avec Zod.
- Toute donnée utilisateur est non fiable, y compris quand elle est transmise à l'IA.
- L'IA ne peut ni écrire en base, ni supprimer, ni accéder à une autre organisation, ni
  lire un secret.

## IA (Phase 12)

- Le modèle ne voit jamais de données de la base pour créer un document ; sa sortie est
  validée (Zod) puis recalculée par le serveur ; `organizationId` et montants fournis par
  le modèle sont ignorés.
- L'IA ne peut pas émettre ni écrire seule : création d'un brouillon uniquement après
  confirmation explicite, atomique et limitée à l'auteur de la proposition.
- Limite de débit par utilisateur (PostgreSQL) et traçabilité complète dans `AIUsage`.
- Le fournisseur simulé est refusé quand `APP_ENV=production`.

## Fournisseur OpenAI (Phase 13)

- `OPENAI_API_KEY` : variable serveur uniquement, jamais préfixée `NEXT_PUBLIC_`, jamais journalisée.
- Les erreurs du fournisseur sont converties en messages génériques ; aucun corps de réponse
  (qui peut contenir des extraits de la requête) n'est journalisé ni affiché.
- Un outil demandé par le modèle n'est exécuté que s'il est dans la liste blanche et que ses
  arguments passent la validation Zod ; l'entreprise vient toujours du contexte serveur.

## Fournisseur Gemini (Phase 14)

- `GEMINI_API_KEY` : serveur uniquement, transmise par en-tête (jamais dans l'URL, qui peut
  être journalisée par des intermédiaires), jamais journalisée.
- Mêmes protections que pour OpenAI : erreurs génériques, aucun corps de réponse exposé,
  outils en liste blanche validés par Zod.

## Usage IA (Phase 15)

- La consommation n'est visible que des rôles ayant `stats:read`, et uniquement pour leur entreprise.
- `AIUsage` ne contient que des compteurs et des identifiants : jamais de prompt, de réponse
  ni de donnée client.
- La saisie des tarifs passe par une commande d'exploitation (accès base requis), pas par une
  route web ; le panneau d'administration (Phase 17) devra la protéger par un rôle plateforme.

## Limites et abus (Phase 16)

- Les plafonds sont appliqués côté serveur, dans les services (jamais seulement dans l'interface) et
  dans la transaction qui crée la pièce, avec verrou : contournement par requêtes simultanées impossible
  pour les factures et devis.
- Les quotas IA bloquent avant tout appel payant au fournisseur ; les refus sont journalisés.
- Une entreprise sans abonnement échappe aux limites : à surveiller (vérification prévue en Phase 17).

## Administration de la plateforme (Phase 17)

- Rôle `SUPER_ADMIN` (champ `User.platformRole`) : attribué UNIQUEMENT en base via
  `pnpm admin:grant` (journalisé) ; jamais depuis l'application ni à l'inscription.
- Chaque page et chaque action `/admin` relit en base le rôle ET le statut ACTIVE de
  l'utilisateur (`resolveAdmin`). Non-admin : pages en 404 (existence non révélée), actions
  `FORBIDDEN`. Un administrateur suspendu ou rétrogradé perd l'accès à la requête suivante.
- Les services d'administration exigent un `AdminContext` (type « branded » produit uniquement
  par `resolveAdmin`) ; une règle ESLint interdit de les importer hors `src/app/admin` et
  `src/server/admin`.
- Confidentialité : l'admin ne voit que des compteurs et métadonnées d'exploitation, jamais
  clients, lignes, montants ni prompts. Il ne peut ni suspendre un autre admin ni se suspendre.
- Toute écriture (abonnement, plan, limite, tarif IA, suspension) est inscrite au journal
  d'activité (`admin.*`, utilisateur, IP, user-agent) dans la même transaction.

## Durcissement (Phase 18)

- **CSP stricte avec nonce** (`src/lib/csp.ts`, posée par `src/proxy.ts` à chaque requête) :
  `script-src 'self' 'nonce-…' 'strict-dynamic'`, aucun script inline ni `eval` en production,
  `frame-ancestors/object-src 'none'`, aucune ressource tierce. Compromis assumé : `style-src`
  garde `'unsafe-inline'` (attributs `style` injectés par Next.js). Conséquence : toutes les pages
  sont rendues dynamiquement (`connection()` dans le layout racine). Les routes PDF sont exclues
  de la CSP (document sans script ; les lecteurs PDF intégrés s'y bloquent) mais gardent les autres
  en-têtes (`nosniff`, `no-store`, HSTS…).
- **Limitation de débit** (table `rate_limit_buckets`, atomique, multi-instances) : écritures
  60 s × 120 par utilisateur (centralisé dans `requireTenant` pour toute permission non `:read`),
  PDF 20/min, administration 60/min, IA 20/min (existant), authentification par Better Auth
  (connexion 5/min, inscription 5/10 min, réinitialisation 3/10 min).
- **CSRF** : server actions protégées par le contrôle Origin/Host natif de Next.js ; Better Auth
  n'accepte que l'origine de l'application (`trustedOrigins`) ; cookies `httpOnly`, `SameSite=Lax`,
  `Secure` explicite dès que l'URL est en HTTPS.
- **Garde statique** (`tests/unit/security-guards.test.ts`) : chaque server action et chaque route
  doit appeler `requireTenant/requireSuperAdmin/requireSession/currentActor` ; `requireTenant()`
  sans permission est interdit dans les actions. Ajouter une action sans contrôle fait échouer
  les tests.
- **Dépendances** : `pnpm audit --prod` propre ; deux alertes transitives de la CLI Prisma
  (`mysql2`, `deepmerge-ts`) corrigées par `pnpm.overrides`. À relancer avant chaque mise en prod.

### Décision : RLS PostgreSQL (non activé pour l'instant)

L'isolation repose aujourd'hui sur : extension Prisma `forTenant` (filtre `organizationId` forcé
sur chaque requête, SQL brut interdit sur le client tenant), clés étrangères composites
`(id, organizationId)`, et tests d'isolation. Le RLS ajouterait une seconde barrière dans la base
(`SET LOCAL app.org_id` par transaction + politiques `USING (organizationId = current_setting(…))`).
Il n'est PAS activé car il impose : un rôle applicatif distinct du propriétaire des tables
(sinon le propriétaire contourne les politiques), une transaction par requête pour porter le
paramètre, et il a un coût de performance et de complexité des migrations. Ce n'est pas anodin à
brancher sans pouvoir le tester sur l'hébergement final. **Recommandation** : l'activer en
Phase 21 avec le rôle de base de production, en défense en profondeur, une fois l'hébergeur
choisi. Les tests d'isolation existants serviraient alors de filet de non-régression.

### Limites connues

- Pas de limitation par IP avant authentification en dehors des routes Better Auth (à compléter
  derrière le CDN/WAF de production).
- Pas de 2FA ni de politique de mot de passe au-delà de la validation actuelle.
- Les en-têtes `x-forwarded-for` ne sont fiables que derrière un proxy de confiance (production).

## E-mails et comptes (Bloc 1 pré-lancement)

- Fournisseur : **Resend** (REST via `fetch`, sans dépendance ; interface `EmailProvider` remplaçable).
  Clé et expéditeur uniquement côté serveur (`RESEND_API_KEY`, `EMAIL_FROM`) ; ni clé ni corps
  d'e-mail (jetons à usage unique) ne sont journalisés. `EMAIL_PROVIDER=log` (développement) est
  refusé en staging/production.
- **Vérification d'adresse obligatoire** en staging/production (`requireEmailVerification`) :
  l'inscription n'ouvre pas de session ; lien valable 24 h ; une tentative de connexion d'un compte
  non vérifié (mot de passe correct) renvoie un lien. En développement local, non exigée.
- **Mot de passe oublié** : lien à usage unique valable 1 h ; réponse identique que l'adresse
  existe ou non ; envoi en arrière-plan (`after`) pour ne pas révéler l'existence du compte par le
  temps de réponse ; après changement : toutes les sessions sont fermées et un e-mail d'alerte est envoyé.
- Limites de débit : demande de réinitialisation 3/10 min, renvoi de vérification 3/10 min,
  réinitialisation 5/10 min (en plus des limites de connexion/inscription).
- À configurer chez le fournisseur avant le lancement : domaine d'envoi vérifié (SPF, DKIM, idéalement
  DMARC) ; sans cela les e-mails finissent en indésirables.
