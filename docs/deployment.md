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

## Sauvegardes et données

- Sauvegardes quotidiennes + restauration à un point dans le temps chez l'hébergeur de la base ;
  **test de restauration** à planifier (au moins une fois avant le lancement, puis chaque trimestre).
- Durée de conservation des factures et documents comptables : **à faire confirmer par votre
  comptable/juriste** (obligation légale) ; ne jamais purger les factures émises.
- Tables techniques purgées automatiquement ou à purger périodiquement : `rate_limit_buckets`
  (purge au fil de l'eau), `auth_rate_limit`, brouillons IA expirés.

## Supervision

- Journaux JSON (pino, secrets masqués) à envoyer vers le collecteur de l'hébergeur.
- Alertes recommandées : `/api/ready` en échec, taux de 5xx, erreurs IA (visibles dans `/admin`),
  pics de refus `RATE_LIMITED`.
- Aucun outil de suivi d'erreurs tiers n'est intégré (à choisir : Sentry ou équivalent).

## Checklist de lancement

Bloquants (à traiter avant d'ouvrir au public) :

- [ ] **E-mails** : aucun fournisseur n'est branché → pas de réinitialisation de mot de passe, pas de
      vérification d'adresse (`requireEmailVerification` désactivé). Choisir un fournisseur
      (ex. Resend, Postmark, SES, SMTP) et l'intégrer à Better Auth.
- [ ] **Pages légales** : mentions légales, CGU, politique de confidentialité (traitement de données
      personnelles : faire vérifier la conformité à la loi algérienne sur la protection des données
      personnelles par un juriste).
- [ ] **Validation comptable** : taux de TVA, règle d'arrondi par ligne, mentions du PDF (NIF, NIS, RC,
      article d'imposition), numérotation.
- [ ] **IA réelle** : test avec vraie clé, `AI_MODEL` et tarifs saisis.
- [ ] **Hébergeur, domaine, HTTPS**, variables de production, base managée sauvegardée et restauration testée.
- [ ] **Dépôt GitHub privé** ; CI observée en vert (jamais exécutée à ce jour), y compris le job Docker.

Recommandés :

- [ ] 2FA pour les comptes propriétaire/admin ; politique de mot de passe renforcée.
- [ ] Limitation par IP avant authentification au niveau CDN/WAF.
- [ ] RLS PostgreSQL en défense en profondeur (voir `docs/security.md`).
- [ ] Support de l'arabe (interface et PDF), enforcement des limites Membres et Stockage.
- [ ] Suivi d'erreurs tiers, tests de charge, audit d'accessibilité.
- [ ] Paiement de l'abonnement en ligne (aujourd'hui : plan attribué par l'équipe).
