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

1. **Contexte tenant** (`src/server/tenant/`) : `resolveTenantContext()` reconstruit
   `{ userId, organizationId, role, permissions, db }` à partir de la session **et
   revérifie l'appartenance en base à chaque requête**. L'organisation active stockée
   dans la session n'est qu'une préférence : si elle désigne une organisation dont
   l'utilisateur n'est pas (ou plus) membre, elle est ignorée et corrigée.
2. **Client de données tenant** (`src/server/db/tenant.ts`, `forTenant`) : extension
   Prisma qui ajoute `organizationId` en **ET** à toute lecture, modification et
   suppression, l'impose à toute création, interdit de le changer, et refuse l'accès aux
   tables globales. Un enregistrement d'une autre organisation est introuvable.
3. **Base de données** : clés étrangères composites `(id, organizationId)` ; PostgreSQL
   refuse une facture liée au client d'une autre organisation.

Row-Level Security PostgreSQL : envisagée en Phase 18 comme défense supplémentaire.

### Règles d'usage

| Où                         | Utiliser                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Page (Server Component)    | `requireTenantPage()` → redirige vers `/login` ou `/onboarding`                                                        |
| Server action / route      | `requireTenant("permission")` en **première ligne**, puis `ctx.db`                                                     |
| Données d'une organisation | toujours `ctx.db` (client tenant)                                                                                      |
| Client global `getDb()`    | uniquement dans les services qui touchent des tables globales (utilisateurs, sessions, plans), avec contrôle explicite |

Le proxy ne protège pas les server actions : chacune vérifie elle-même session et permission.

### Rôles

Matrice dans `src/lib/permissions.ts`, testée dans `tests/unit/permissions.test.ts`.

| Rôle       | Résumé                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| OWNER      | Tout, dont suppression de l'entreprise et abonnement                                                                                   |
| ADMIN      | Tout sauf suppression de l'entreprise et abonnement                                                                                    |
| ACCOUNTANT | Facturation complète (émettre, annuler), paiements, statistiques, IA ; pas de gestion des membres ni des paramètres ; ne supprime rien |
| EMPLOYEE   | Clients, devis, brouillons de factures, IA ; n'émet pas, n'encaisse pas, pas de statistiques                                           |
| VIEWER     | Lecture seule, sans IA                                                                                                                 |

## Modules métier

Chaque module suit le même découpage (exemple : clients, Phase 5) :

| Couche     | Fichier                              | Rôle                                                                                                                  |
| ---------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Validation | `src/lib/validation/customer.ts`     | Schémas Zod partagés formulaire / serveur, paramètres de liste tolérants (une URL invalide est corrigée, pas rejetée) |
| Service    | `src/server/services/customers.ts`   | Vérifie la permission **lui-même**, n'utilise que `ctx.db`, journalise, renvoie des DTO                               |
| Actions    | `src/app/(app)/customers/actions.ts` | `requireTenant(permission)` puis service ; renvoie toujours un `ActionResult`                                         |
| Pages      | `src/app/(app)/customers/**`         | Server Components ; `orNotFound()` transforme NOT_FOUND en 404                                                        |

- Pagination, recherche et filtres côté serveur, par paramètres d'URL (liens partageables,
  fonctionne sans JavaScript).
- Une ressource d'une autre entreprise renvoie NOT_FOUND, jamais FORBIDDEN : on ne révèle
  pas son existence.
- Suppression définitive seulement sans document lié ; sinon archivage.
- Montants affichés avec `formatMoney()` (`src/lib/format.ts`), formatage exact sur chaînes
  décimales, sans conversion en nombre flottant.

## Montants

- Module unique `src/lib/money.ts` (decimal.js, partagé navigateur/serveur) : `round2`,
  `vatAmount`, `ttcFromHt`, schémas Zod `moneySchema` (saisie française « 1 250,50 »
  acceptée, 2 décimales, 12 chiffres entiers max) et `ratePercentSchema` (0 à 100 %).
- Arrondi **demi-supérieur au centime**, centralisé dans ce module (à ajuster ici si une
  règle fiscale vérifiée l'exige).
- Les aperçus calculés dans le navigateur (prix TTC d'un produit) ne sont jamais
  enregistrés : le serveur revalide et recalcule.
- Stockage `Decimal(14,2)`, calculs avec `Prisma.Decimal` / decimal.js, jamais de `number`.
- Tous les totaux sont recalculés côté serveur ; ceux envoyés par le client sont ignorés.
- Aucun taux de TVA codé en dur : table `TaxRate` par organisation, saisie par l'entreprise
  dans Paramètres → TVA ; une nouvelle entreprise démarre sans taux. Un seul taux par défaut.
- Produits et lignes de documents stockent la **valeur** du taux : modifier ou désactiver un
  taux ne change jamais un document existant. Un produit ne peut utiliser qu'un taux actif
  de l'entreprise (il peut garder son taux actuel s'il a été désactivé depuis).

## Calcul des documents

`src/lib/billing.ts`, module pur partagé navigateur/serveur :

| Étape (par ligne) | Calcul                               |
| ----------------- | ------------------------------------ |
| Brut              | arrondi(quantité × prix unitaire HT) |
| Remise            | arrondi(brut × remise % / 100)       |
| HT net            | brut − remise                        |
| TVA               | arrondi(HT net × TVA % / 100)        |
| TTC               | HT net + TVA                         |

Le document additionne ses lignes : le total TTC est **toujours** la somme exacte des
lignes. Arrondi au centime, demi-supérieur, à chaque étape. La TVA est arrondie par ligne ;
une ventilation par taux est fournie pour l'affichage et le PDF. **À valider avec un
comptable** : si un calcul de TVA par taux est exigé, seul ce module change.

`src/server/services/document-lines.ts` vérifie les produits et taux de chaque ligne puis
appelle ce moteur : les montants envoyés par le navigateur sont ignorés.

## Numérotation

`src/server/services/numbering.ts` : un compteur par (entreprise, type, année de la date du
document). L'incrément a lieu dans la transaction qui émet le document ; le verrou de ligne
PostgreSQL sérialise les émissions simultanées et une émission annulée ne consomme pas de
numéro. Préfixe et largeur repris du compteur le plus récent (défaut FAC / DEV, 6 chiffres).
Testé avec 25 envois simultanés.

## Devis

- Statuts : brouillon → envoyé → accepté / refusé ; « expiré » est calculé (envoyé et date
  de validité dépassée, heure d'Alger) ; « facturé » est posé par la conversion en facture (Phase 8).
- Seul un brouillon se modifie ou se supprime. L'envoi attribue le numéro et fige le devis ;
  pour changer un devis envoyé, on le duplique.
- Les listes de l'éditeur (clients, produits) sont limitées à 500 entrées ; un sélecteur
  avec recherche serveur les remplacera au-delà.

## Factures

`src/server/services/invoices.ts` (même découpage que les devis).

- Statuts stockés : `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`.
  `OVERDUE` est **calculé** (émise ou payée en partie, échéance dépassée, heure d'Alger),
  jamais stocké ; les filtres de liste le gèrent aussi côté base.
- **Brouillon** : modifiable, supprimable, sans numéro. Montants recalculés côté serveur.
- **Émission** (`invoices:issue`) : une transaction attribue le numéro via `DocumentSequence`
  (verrou de ligne, numérotation continue, contrainte unique `(organizationId, invoiceNumber)`),
  fige les coordonnées du vendeur et du client (`sellerSnapshot`, `customerSnapshot`) et
  verrouille la facture. L'`UPDATE` est conditionné à `status = DRAFT` : deux émissions
  simultanées de la même facture, une seule réussit.
- Une facture émise n'est ni modifiable ni supprimable. **Annulation** (`invoices:cancel`) :
  seulement une facture émise **sans aucun paiement** ; elle reste en base avec son numéro.
  Une facture déjà encaissée relève d'un avoir (non géré pour l'instant).
- **Conversion d'un devis accepté** : copie des lignes et totaux déjà calculés du devis dans
  un brouillon de facture et passage du devis à « facturé », dans une transaction. Une seule
  facture par devis (contrainte unique `(quoteId, organizationId)` + `UPDATE` conditionné).
- `amountPaid` et les statuts `PARTIALLY_PAID` / `PAID` seront posés par le module Paiements
  (Phase 9). La date d'émission est choisie par l'utilisateur : la numérotation suit l'ordre
  d'émission, pas l'ordre des dates. **À valider avec un comptable** si une chronologie
  stricte est exigée.

## Base de données

- Schéma : `prisma/schema.prisma`. Client : `src/server/db/client.ts` (Prisma 7 +
  adaptateur `pg`, aucun moteur natif à l'exécution).
- Relations internes à une organisation : clés composites `(id, organizationId)` avec
  `ON DELETE NO ACTION`. On ne supprime pas un client ou un produit déjà utilisé dans un
  document : on l'archive ou le désactive. (`SET NULL` est impossible ici, il viderait
  aussi `organizationId`.) La suppression d'une organisation supprime tout en cascade.
- Ces clés `NO ACTION` sont **différées** (`DEFERRABLE INITIALLY DEFERRED`, migration
  `deferred_tenant_fks`) : vérifiées au commit, une fois la cascade terminée. Sans cela,
  supprimer une entreprise échouait dès qu'une ligne de devis référençait un produit.
- Contraintes `CHECK` en base : montants positifs, taux entre 0 et 100, paiement > 0,
  numéro présent si et seulement si la facture n'est plus un brouillon.
- Migrations : voir le README (« Créer une migration »). La CI applique les migrations avec
  le vrai `prisma migrate deploy` et échoue sur toute dérive avec le schéma.

## Erreurs

`src/server/errors.ts` : les `AppError` portent un message sûr ; toute autre erreur est
journalisée avec un `errorId` et le client ne reçoit qu'un message générique et cet ID.
Les server actions passent par `safeAction()` et renvoient toujours un `ActionResult`.
