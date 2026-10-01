# FacturDZ AI

Le logiciel de facturation intelligent pour les entreprises algériennes : clients, produits,
devis, factures, PDF, paiements, tableau de bord et assistant IA (OpenAI / Gemini), en SaaS
multi-entreprise.

> **État : Phase 4 terminée** (multi-entreprise, rôles). Voir [Feuille de route](#feuille-de-route).

## Stack

| Couche      | Choix                                                        |
| ----------- | ------------------------------------------------------------ |
| Application | Next.js 16 (App Router), React 19, TypeScript strict         |
| UI          | Tailwind CSS 4, composants shadcn/ui, police Geist           |
| Base        | PostgreSQL 16, Prisma 7 (adaptateur `pg`, sans moteur natif) |
| Auth        | Better Auth : e-mail + mot de passe, sessions en base        |
| Validation  | Zod 4, React Hook Form                                       |
| PDF         | @react-pdf/renderer côté serveur _(Phase 10)_                |
| IA          | Abstraction `AIProvider` → OpenAI / Gemini _(Phases 12–15)_  |
| Logs        | pino, masquage automatique des secrets                       |
| Tests       | Vitest (unitaires + intégration), Playwright (e2e)           |

## Démarrage local

Prérequis : Node.js ≥ 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install                    # génère aussi le client Prisma
cp .env.example .env            # renseigner AUTH_SECRET (openssl rand -base64 32)
createdb facturdz && createdb facturdz_test   # ou via votre outil PostgreSQL
pnpm db:deploy                  # applique les migrations
pnpm db:seed                    # données de démonstration fictives
pnpm dev                        # http://localhost:3000
```

Comptes de démonstration créés par le seed (développement uniquement) :
`owner@demo.facturdz.test` (OWNER) et `comptable@demo.facturdz.test` (ACCOUNTANT),
mot de passe `Demo-FacturDZ-2026`.

Dans l'environnement cloud de Claude, PostgreSQL peut s'arrêter entre deux sessions :
`pg_ctlcluster 16 main start`.

## Base de données

- Schéma : [`prisma/schema.prisma`](prisma/schema.prisma) — 23 modèles, multi-tenant par
  `organizationId`, clés étrangères composites `(id, organizationId)` qui empêchent au niveau
  PostgreSQL toute référence vers une autre organisation.
- Migrations : `prisma/migrations/`. Les contraintes `CHECK` (montants positifs, taux 0–100,
  numéro obligatoire sur une facture émise) sont ajoutées à la main en fin de migration.
- Seed : [`prisma/seed.ts`](prisma/seed.ts), idempotent, refusé en production.

### Créer une migration

**Sur une machine normale** (moteur Prisma disponible) :

```bash
# modifier prisma/schema.prisma, puis :
pnpm db:migrate --name description_courte   # prisma migrate dev
```

**Dans l'environnement cloud de Claude** (moteur Prisma non téléchargeable) :

1. modifier `prisma/schema.prisma` ;
2. écrire `prisma/migrations/<horodatage>_<nom>/migration.sql` à la main ;
3. `pnpm db:migrate:local` puis `pnpm db:verify` (doit afficher ✔) ;
4. la CI exécute le vrai `prisma migrate deploy` et `prisma migrate diff` ; en cas d'écart,
   elle échoue et publie le SQL officiel attendu (artefact `next-migration-sql`).

Ne jamais modifier une migration déjà appliquée : `db:migrate:local` le refuse (checksum).

## Scripts

| Commande                              | Rôle                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                            | Serveur de développement                                   |
| `pnpm build`                          | Build de production                                        |
| `pnpm typecheck`                      | Génération des types de routes + `tsc`                     |
| `pnpm lint`                           | ESLint (inclut les règles d'architecture)                  |
| `pnpm test`                           | Tests Vitest                                               |
| `pnpm check`                          | typecheck + lint + tests (à lancer avant tout commit)      |
| `pnpm format`                         | Prettier                                                   |
| `pnpm test:unit` / `test:integration` | Une seule des deux suites ; l'intégration exige PostgreSQL |
| `pnpm db:deploy`                      | Applique les migrations (`prisma migrate deploy`)          |
| `pnpm db:seed`                        | Seed de développement                                      |
| `pnpm db:migrate:local`               | Applique les migrations sans moteur Prisma                 |
| `pnpm db:reset:local`                 | Vide la base locale, migre, seed                           |
| `pnpm db:verify`                      | Vérifie que la base correspond exactement au schéma        |

## Variables d'environnement

Voir [`.env.example`](.env.example). Règles :

- Les secrets (`AUTH_SECRET`, `DATABASE_URL`, clés IA) ne sont **jamais** préfixés `NEXT_PUBLIC_`.
- Ils ne sont lus que dans `src/server/env.ts`, validés par Zod ; le lint refuse tout `process.env` ailleurs.
- Chaque environnement (développement, staging, production) a ses propres valeurs dans l'hébergeur.
- `.env*` est ignoré par Git, sauf `.env.example`.

## Architecture

Résumé ci-dessous, détails dans [`docs/architecture.md`](docs/architecture.md).

```
src/
├─ app/                 routes (marketing, auth, app, admin, api)
├─ server/              code serveur uniquement (`server-only`)
│  ├─ env.ts            variables d'environnement validées
│  ├─ errors.ts         AppError, erreurs publiques, safeAction
│  ├─ logger.ts         pino + masquage des secrets
│  ├─ auth/             Better Auth, session courante
│  ├─ tenant/           contexte d'entreprise, vérification des permissions
│  ├─ db/               client Prisma global (client.ts) et limité à une entreprise (tenant.ts)
│  ├─ services/         logique métier (calculs, numérotation, audit)
│  ├─ ai/               providers, outils, schémas, prompts, usage
│  ├─ pdf/ plans/ security/
├─ components/          ui/, forms/, layout/
└─ lib/                 utilitaires partagés client/serveur
prisma/                 schéma, migrations, seed
scripts/db/             migration et vérification sans moteur Prisma
.github/workflows/      CI (migrations officielles, dérive, tests, build)
```

Documentation complémentaire : [`docs/ai.md`](docs/ai.md), [`docs/security.md`](docs/security.md).

## Feuille de route

| Phase | Contenu                                                       | État    |
| ----- | ------------------------------------------------------------- | ------- |
| 1     | Architecture + initialisation                                 | ✅      |
| 2     | PostgreSQL + Prisma                                           | ✅      |
| 3     | Authentification                                              | ✅      |
| 4     | Multi-tenancy                                                 | ✅      |
| 5–11  | Clients, produits, devis, factures, paiements, PDF, dashboard | à faire |
| 12–15 | FacturDZ AI, OpenAI, Gemini, usage et coûts IA                | à faire |
| 16–21 | Plans, admin, sécurité, tests, landing, production            | à faire |
