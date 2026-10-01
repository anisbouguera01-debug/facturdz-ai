# FacturDZ AI

Le logiciel de facturation intelligent pour les entreprises algériennes : clients, produits,
devis, factures, PDF, paiements, tableau de bord et assistant IA (OpenAI / Gemini), en SaaS
multi-entreprise.

> **État : Phase 1 terminée** (initialisation et fondations). Voir [Feuille de route](#feuille-de-route).

## Stack

| Couche      | Choix                                                       |
| ----------- | ----------------------------------------------------------- |
| Application | Next.js 16 (App Router), React 19, TypeScript strict        |
| UI          | Tailwind CSS 4, composants shadcn/ui, police Geist          |
| Base        | PostgreSQL 16, Prisma 7 _(Phase 2)_                         |
| Auth        | Better Auth, sessions en base _(Phase 3)_                   |
| Validation  | Zod 4, React Hook Form                                      |
| PDF         | @react-pdf/renderer côté serveur _(Phase 10)_               |
| IA          | Abstraction `AIProvider` → OpenAI / Gemini _(Phases 12–15)_ |
| Logs        | pino, masquage automatique des secrets                      |
| Tests       | Vitest (unitaires + intégration), Playwright (e2e)          |

## Démarrage local

Prérequis : Node.js ≥ 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env.local      # puis renseigner AUTH_SECRET (openssl rand -base64 32)
pnpm dev                        # http://localhost:3000
```

Base de données, migrations et seed : documentés en Phase 2.

## Scripts

| Commande         | Rôle                                                  |
| ---------------- | ----------------------------------------------------- |
| `pnpm dev`       | Serveur de développement                              |
| `pnpm build`     | Build de production                                   |
| `pnpm typecheck` | Génération des types de routes + `tsc`                |
| `pnpm lint`      | ESLint (inclut les règles d'architecture)             |
| `pnpm test`      | Tests Vitest                                          |
| `pnpm check`     | typecheck + lint + tests (à lancer avant tout commit) |
| `pnpm format`    | Prettier                                              |

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
│  ├─ auth/ tenant/     session, contexte d'organisation, permissions
│  ├─ db/               client Prisma + repositories tenant-scopés
│  ├─ services/         logique métier (calculs, numérotation, audit)
│  ├─ ai/               providers, outils, schémas, prompts, usage
│  ├─ pdf/ plans/ security/
├─ components/          ui/, forms/, layout/
└─ lib/                 utilitaires partagés client/serveur
```

Documentation complémentaire : [`docs/ai.md`](docs/ai.md), [`docs/security.md`](docs/security.md).

## Feuille de route

| Phase | Contenu                                                       | État    |
| ----- | ------------------------------------------------------------- | ------- |
| 1     | Architecture + initialisation                                 | ✅      |
| 2     | PostgreSQL + Prisma                                           | à faire |
| 3     | Authentification                                              | à faire |
| 4     | Multi-tenancy                                                 | à faire |
| 5–11  | Clients, produits, devis, factures, paiements, PDF, dashboard | à faire |
| 12–15 | FacturDZ AI, OpenAI, Gemini, usage et coûts IA                | à faire |
| 16–21 | Plans, admin, sécurité, tests, landing, production            | à faire |
