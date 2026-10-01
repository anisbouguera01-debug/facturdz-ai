# Architecture — FacturDZ AI

## Vue d'ensemble

```
Navigateur
  │
  ▼
Server Components · Server Actions · Route Handlers      (src/app)
  │  1. session        2. contexte tenant      3. permission      4. validation Zod
  ▼
Services métier                                           (src/server/services)
  │  calculs Decimal, règles, numérotation, journal d'audit
  ▼
Repositories tenant-scopés  ─►  Prisma  ─►  PostgreSQL     (src/server/db)

Services IA (src/server/ai) ─► AIProvider ─► OpenAIProvider | GeminiProvider
  └─ outils en lecture seule, organizationId injecté par le serveur, AIUsage systématique
```

Approche **Data Access Layer** recommandée par Next.js : seul le code de `src/server/`
accède aux données et aux secrets, et il renvoie des objets minimaux (DTO) aux composants.

## Règles imposées par l'outillage

| Règle                                              | Mécanisme                                                 |
| -------------------------------------------------- | --------------------------------------------------------- |
| Le code serveur n'arrive jamais dans le navigateur | `import "server-only"` en tête des modules `src/server/*` |
| Secrets lus uniquement dans `src/server/env.ts`    | ESLint `no-restricted-syntax` sur `process.env`           |
| SDK IA uniquement dans `src/server/ai/providers`   | ESLint `no-restricted-imports`                            |
| Client Prisma uniquement dans `src/server/db`      | ESLint `no-restricted-imports`                            |
| Configuration invalide = démarrage refusé          | Validation Zod de l'environnement                         |

## Multi-tenant

Base partagée, colonne `organizationId` sur chaque table métier. Trois niveaux de défense :

1. `getTenantContext()` reconstruit `{ userId, organizationId, role }` à partir de la
   session **et vérifie l'appartenance en base à chaque requête**. Un identifiant venant du
   client n'est jamais une preuve d'autorisation.
2. Les repositories exigent ce contexte et filtrent toujours par `organizationId`.
3. Les relations entre objets d'une même organisation utilisent des clés étrangères
   composites `(id, organizationId)` : PostgreSQL refuse une facture liée au client d'une
   autre organisation.

Row-Level Security PostgreSQL : envisagée en Phase 18 comme défense supplémentaire.

## Montants

- Stockage `Decimal(14,2)`, calculs avec `Prisma.Decimal` / decimal.js, jamais de `number`.
- Tous les totaux sont recalculés côté serveur ; ceux envoyés par le client sont ignorés.
- Aucun taux de TVA codé en dur : table `TaxRate` par organisation.

## Factures

- Statuts stockés : `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
- `OVERDUE` est **calculé** (échéance passée et reste à payer > 0), jamais stocké.
- Le numéro est attribué **à l'émission** via `DocumentSequence` (verrou de ligne dans la
  transaction), avec une contrainte d'unicité `(organizationId, invoiceNumber)`.
- Une facture émise n'est pas supprimable, seulement annulable.
- Les informations vendeur et client sont figées dans la facture à l'émission.

Le schéma de base proposé est dans `prisma/schema.prisma.proposal` ; il devient le schéma
officiel en Phase 2.

## Erreurs

`src/server/errors.ts` : les `AppError` portent un message sûr ; toute autre erreur est
journalisée avec un `errorId` et le client ne reçoit qu'un message générique et cet ID.
Les server actions passent par `safeAction()` et renvoient toujours un `ActionResult`.
