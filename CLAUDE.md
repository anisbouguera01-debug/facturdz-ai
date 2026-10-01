@AGENTS.md

# FacturDZ AI — règles pour Claude

- Lire `docs/architecture.md`, `docs/security.md` et `docs/ai.md` avant toute modification structurante.
- Avant de modifier un fichier : le lire, comprendre son rôle, chercher ses usages.
- Avant d'ajouter une dépendance : vérifier qu'aucune dépendance existante ne suffit.
- Avant de toucher la base : relire `prisma/schema.prisma`, créer une migration propre, vérifier relations et index.
- Montants : Decimal uniquement, calculés côté serveur. Aucun taux fiscal codé en dur.
- Toute requête de données passe par le contexte tenant et filtre par `organizationId`.
- Secrets : uniquement via `serverEnv()` ; jamais dans les logs ni côté client.
- Après chaque phase : `pnpm check` puis `pnpm build` ; ne pas passer à la phase suivante si l'une échoue.
