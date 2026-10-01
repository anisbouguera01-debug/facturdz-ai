@AGENTS.md

# FacturDZ AI — règles pour Claude

- Lire `docs/architecture.md`, `docs/security.md` et `docs/ai.md` avant toute modification structurante.
- Avant de modifier un fichier : le lire, comprendre son rôle, chercher ses usages.
- Avant d'ajouter une dépendance : vérifier qu'aucune dépendance existante ne suffit.
- Avant de toucher la base : relire `prisma/schema.prisma`, créer une migration propre, vérifier relations et index.
- Montants : Decimal uniquement, calculés côté serveur. Aucun taux fiscal codé en dur.
- Données d'une entreprise : `requireTenant("permission")` en première ligne de chaque server action/route, puis `ctx.db` (client limité à l'entreprise). `getDb()` seulement pour les tables globales.
- Secrets : uniquement via `serverEnv()` ; jamais dans les logs ni côté client.
- Après chaque phase : `pnpm check` puis `pnpm build` ; ne pas passer à la phase suivante si l'une échoue.
