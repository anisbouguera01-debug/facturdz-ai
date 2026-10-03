# Déploiement et exploitation (Phase 21)

L'application est prête à être hébergée sur **Vercel** (ou équivalent) avec un **PostgreSQL managé**,
ou en **conteneur Docker**. Le choix de l'hébergeur n'est pas figé par le code. Ce qui n'a PAS pu
être fait ici (aucun hébergeur, domaine ni fournisseur d'e-mail choisis) est listé dans la
[checklist de lancement](#checklist-de-lancement).

## Environnements

|                 | development           | staging                       | production                |
| --------------- | --------------------- | ----------------------------- | ------------------------- |
| `APP_ENV`       | `development`         | `staging`                     | `production`              |
| Base            | locale (`.env.local`) | base dédiée, données fictives | base managée, sauvegardée |
| HTTPS / domaine | non                   | oui                           | oui                       |
| IA              | `mock` possible       | fournisseur réel, clé de test | fournisseur réel          |
| Seed de démo    | oui                   | optionnel                     | **refusé** par le script  |

Chaque environnement a ses propres valeurs, saisies chez l'hébergeur (jamais committées). Staging et
production appliquent une validation stricte au **démarrage** (`src/instrumentation.ts`) : HTTPS
obligatoire, secret non « d'exemple », base non locale, modèle et clé IA présents, `mock` interdit.
Avant de déployer : `pnpm env:check` (variables dans le shell/CI ; n'affiche jamais de valeur).

## Variables d'environnement

| Variable                            | Rôle                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `APP_ENV`                           | `development` / `staging` / `production`                                           |
| `DATABASE_URL`                      | PostgreSQL 16+ ; connexion applicative                                             |
| `AUTH_SECRET`                       | ≥ 32 caractères aléatoires (`openssl rand -base64 32`), distinct par environnement |
| `NEXT_PUBLIC_APP_URL`               | URL publique https (intégrée au build : à fixer AVANT `build`)                     |
| `AI_PROVIDER`, `AI_MODEL`           | `openai` ou `gemini` ; nom exact du modèle (aucun défaut)                          |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | selon le fournisseur ; jamais côté navigateur                                      |
| `LOG_LEVEL`                         | `info` en production                                                               |

## Option A — Vercel + PostgreSQL managé

1. Créer la base managée (région proche des utilisateurs, ex. Europe) et un **rôle applicatif**
   dédié (pas le super-utilisateur). Prévoir deux URL : directe (migrations) et poolée (application)
   si le fournisseur impose un pooler. Le code utilise des transactions courtes avec verrou de ligne
   (numérotation, limites) : compatible avec un pooler en mode transaction.
2. Importer le dépôt dans Vercel, renseigner les variables par environnement (Production / Preview).
3. Migrations **avant** chaque mise en ligne (étape de CI ou commande manuelle) :
   `DATABASE_URL=<url directe> pnpm db:deploy`.
4. Déployer, puis vérifier `GET /api/ready` → `{"status":"ready"}`.

## Option B — Docker

```bash
docker build --build-arg NEXT_PUBLIC_APP_URL=https://app.exemple.dz -t facturdz .
docker build --target migrate -t facturdz-migrate .
docker run --rm -e DATABASE_URL=… facturdz-migrate          # migrations
docker run -p 3000:3000 -e APP_ENV=production -e DATABASE_URL=… -e AUTH_SECRET=… … facturdz
```

Image `node:22-slim`, utilisateur non-root, `HEALTHCHECK` sur `/api/health`, aucun secret embarqué.
Le mode `standalone` a été validé en local (build, démarrage, 7 tests e2e dont PDF et polices) ;
**la construction de l'image Docker elle-même n'a pas pu être exécutée dans l'environnement de
développement (pas de démon Docker)** : un job CI la construit désormais, à surveiller au premier passage.
Derrière un reverse proxy, il doit transmettre `X-Forwarded-For` (IP dans le journal d'audit).

## Sondes

- `GET /api/health` : le processus répond (liveness).
- `GET /api/ready` : la base répond (readiness) ; 503 sinon. Réponses minimales, publiques par conception.

## Procédure de mise en production

1. CI verte (typecheck, lint, tests, couverture, bundle sans secret, e2e).
2. `pnpm env:check` avec les variables de l'environnement cible, puis `pnpm legal:check`
   (renseigner `src/lib/legal-config.ts` ; les pages légales sont un **gabarit à faire valider par un
   juriste** avant toute commercialisation).
3. Sauvegarde/point de restauration de la base (automatique chez un hébergeur sérieux ; le vérifier).
4. `pnpm db:deploy` (migrations). Elles sont **« en avant seulement »**.
5. Déploiement de la nouvelle version, puis `/api/ready`, puis parcours de fumée à la main :
   connexion → facture → PDF.
6. Surveiller les logs et `/admin` (erreurs IA, entreprises sans abonnement) pendant l'heure suivante.

**Retour arrière** : redéployer la version précédente de l'application. Une migration ne se
« défait » pas : écrire les migrations de façon compatible avec la version N-1 (ajouter d'abord,
retirer plus tard) ; pour une erreur de données, restauration à un point dans le temps (PITR).

## Première mise en service

1. `pnpm db:deploy` sur la base vide. **Ne pas lancer le seed** (il refuse en production).
2. Les plans FREE/BASIC/PRO/BUSINESS existent via les migrations ; fixer **les prix réels** et
   vérifier les plafonds dans `/admin/plans`.
3. Créer son compte via l'inscription, puis le promouvoir depuis une machine de confiance :
   `DATABASE_URL=<prod> pnpm admin:grant --email vous@exemple.dz` (action tracée).
4. Saisir les tarifs du modèle IA choisi (`/admin/pricing`, ou `pnpm ai:pricing`) — sans tarif, le
   coût IA reste « inconnu » (jamais 0).
5. Tester l'IA **avec la vraie clé** (jamais éprouvée contre les vraies API à ce jour).
6. Rattacher chaque nouvelle entreprise à un plan (les entreprises sans abonnement n'ont aucune limite
   — la vue d'ensemble admin les signale).

## Sauvegardes, restauration (Bloc 5)

Deux niveaux, aucun ne remplace l'autre :

1. **Chez l'hébergeur de la base** : sauvegardes automatiques quotidiennes + PITR (restauration à la
   minute). À activer et à vérifier dans leur console ; conservation ≥ 7 jours (30 recommandé).
2. **Vos propres dumps logiques** (indépendants de l'hébergeur, portables) :

```bash
DATABASE_URL=<url directe> BACKUP_KEEP_DAYS=30 pnpm db:backup        # ./backups/facturdz-<date>.dump + .sha256
pnpm db:restore ./backups/facturdz-<date>.dump postgresql://…/base_neuve   # base cible VIDE, explicite
DATABASE_URL=<url> pnpm db:verify                                    # le schéma restauré = schema.prisma
```

Garde-fous du script de restauration (testés) : somme de contrôle vérifiée ; refus si la cible est
`DATABASE_URL` (sauf `RESTORE_CONFIRM=ecraser-la-base-courante`) ; refus si la cible n'est pas vide ;
une seule transaction (tout ou rien). Le dump contient toutes les données clients : droits 600, dossier
hors dépôt (`/backups/` est ignoré par git), stockage chiffré, copie hors du serveur (ex. bucket privé).

**Procédure de sinistre** : (1) créer une base neuve ; (2) `pnpm db:restore` du dernier dump (ou PITR chez
l'hébergeur) ; (3) `pnpm db:verify` ; (4) pointer `DATABASE_URL` de l'application sur la base restaurée ;
(5) `/api/ready` puis parcours de fumée ; (6) noter la perte de données (RPO) = temps depuis le dernier dump.

**Test de restauration réel** : `DATABASE_URL=<url> pnpm db:restore-test` sauvegarde, restaure dans une base
temporaire, compare les lignes de **chaque** table, les contraintes et le schéma, puis supprime la base
temporaire. Exécuté ici sur la base de démo : 25 tables, 177 lignes identiques, 76 contraintes, schéma
conforme. **Non réalisé sur la vraie base managée** (elle n'existe pas encore) : refaire ce test, via une
base neuve créée dans la console de l'hébergeur, avant le lancement puis chaque trimestre.

Conservation légale des factures : **à faire confirmer par votre comptable/juriste** ; ne jamais purger les
factures émises. Tables techniques à purger : `rate_limit_buckets`, `auth_rate_limit`, brouillons IA expirés.

## Migrations

`pnpm db:deploy` (= `prisma migrate deploy`) applique les migrations dans l'ordre, en avant seulement. La CI
exécute `prisma validate`, `migrate deploy` sur une base vide, **`migrate diff` (dérive migrations ↔ schéma)**
et `pnpm db:verify`. En production : sauvegarde (voir plus haut) → `db:deploy` → déploiement.
Dans l'environnement de développement cloud, le moteur Prisma est indisponible : `db:migrate:local` rejoue le
même contrat et `db:verify` compare la base au schéma ; la vérification officielle n'a lieu qu'en CI.

## Domaine et HTTPS

1. Acheter le domaine (ex. `app.votredomaine.dz`) ; DNS : `CNAME`/`A` vers l'hébergeur (Vercel : CNAME).
2. HTTPS : certificat automatique de l'hébergeur (Let's Encrypt). Option Docker : proxy inverse (Caddy,
   Traefik, nginx) qui termine le TLS ; l'application n'écoute qu'en interne.
3. Fixer `NEXT_PUBLIC_APP_URL=https://app.votredomaine.dz` **avant** le build ; l'application refuse de démarrer
   en staging/production sans https. Les cookies de session sont `Secure` en https.
4. Les en-têtes de sécurité (CSP avec nonce, HSTS, etc.) sont posés par l'application ; vérifier après mise en
   ligne avec un testeur d'en-têtes (securityheaders.com) et le cadenas du navigateur.
5. E-mail : domaine d'envoi vérifié chez Resend (SPF, DKIM, DMARC) ; sinon les messages finissent en spam.

## Journaux et supervision

- Journaux JSON (pino) sur la sortie standard, secrets masqués (`REDACT_PATHS`) ; aucun prompt, réponse IA,
  mot de passe ni jeton n'y figure. Les envoyer vers le collecteur de l'hébergeur (Vercel Logs, Loki…) ;
  filtrer sur `level>=40` (avertissements et erreurs) ; `requestId` relie un appel IA à son `AIUsage`.
- Sondes : `GET /api/health` (processus) et `GET /api/ready` (base) → à brancher sur un moniteur externe
  (UptimeRobot, Better Stack…) avec alerte e-mail/SMS.
- Alertes recommandées : `/api/ready` en échec, taux de 5xx, erreurs IA (`/admin`), pics de `RATE_LIMITED`,
  échecs d'envoi d'e-mail, espace disque/connexions de la base.
- Aucun outil de suivi d'erreurs tiers n'est intégré (à choisir : Sentry ou équivalent) : à ce jour les
  erreurs applicatives ne sont visibles que dans les journaux.

## Checklist de lancement

Bloquants (à traiter avant d'ouvrir au public) :

- [ ] **E-mails** : code prêt (Resend, vérification d'adresse, mot de passe oublié). Reste à créer le compte,
      vérifier le domaine d'envoi (SPF/DKIM/DMARC) et renseigner `RESEND_API_KEY` et `EMAIL_FROM`.
- [ ] **Pages légales** : gabarits en place (`/mentions-legales`, `/cgu`, `/confidentialite`). Reste à
      renseigner `src/lib/legal-config.ts` (`pnpm legal:check`) et à les faire valider par un juriste
      (loi algérienne sur la protection des données personnelles).
- [ ] **Validation comptable** : calculs vérifiés et testés (`docs/accounting.md`) ; reste la validation par un
      expert-comptable (taux de TVA, arrondi, mentions du PDF, numérotation).
- [ ] **IA réelle** : `pnpm ai:live` avec vraie clé, `AI_MODEL` et tarifs saisis (`docs/ai.md`).
- [ ] **Hébergeur, domaine, HTTPS**, variables de production, base managée sauvegardée et restauration testée.
- [ ] **Dépôt GitHub privé** ; CI observée en vert (jamais exécutée à ce jour), y compris le job Docker.

Recommandés :

- [ ] 2FA pour les comptes propriétaire/admin ; politique de mot de passe renforcée.
- [ ] Limitation par IP avant authentification au niveau CDN/WAF.
- [ ] RLS PostgreSQL en défense en profondeur (voir `docs/security.md`).
- [ ] Support de l'arabe (interface et PDF), enforcement des limites Membres et Stockage.
- [ ] Suivi d'erreurs tiers, tests de charge, audit d'accessibilité.
- [ ] Paiement de l'abonnement en ligne (aujourd'hui : plan attribué par l'équipe).
