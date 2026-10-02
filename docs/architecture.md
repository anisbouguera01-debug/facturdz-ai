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

## Paiements

`src/server/services/payments.ts`, actions dans `src/app/(app)/payments/actions.ts`.

- Un paiement se rattache à une facture **émise ou payée en partie** (jamais brouillon,
  annulée ou soldée). Permission `payments:write` (OWNER, ADMIN, ACCOUNTANT).
- **Pas de surpaiement** : le montant ne dépasse pas le reste à payer ; pas de date future.
- **Concurrence** : la transaction verrouille d'abord la ligne de la facture (un `UPDATE`
  conditionné au statut), relit l'état validé, contrôle le reste à payer, insère le paiement,
  puis **recalcule** `amountPaid` et le statut depuis les paiements non annulés. Dix
  paiements simultanés ne peuvent donc jamais dépasser le total ensemble.
- **Statut dérivé** : 0 payé → `ISSUED`, payé partiel → `PARTIALLY_PAID`, payé = total →
  `PAID`. Le `CHECK` PostgreSQL `invoices_paid_check` interdit toute incohérence
  (payé > total, `PAID` sans solde, etc.), même en cas de bug applicatif.
- **Jamais de suppression** : un paiement est **annulé** avec un motif obligatoire
  (`voidedAt`, `voidedById`, `voidReason`) ; il reste visible, barré, dans la facture et dans
  la liste, et le journal d'audit conserve qui a fait quoi. Le statut est recalculé.
- Une facture ayant reçu un paiement non annulé ne peut pas être annulée ; si tous ses
  paiements sont annulés, elle redevient annulable.
- Les remboursements et avoirs ne sont pas gérés. Aucun frais, timbre ou retenue n'est
  calculé : règles fiscales à valider avant tout ajout.

## PDF

`src/server/pdf/` : `model.ts` (modèle neutre construit à partir des services), `render.ts`
(rendu A4 avec **pdfkit**), `response.ts` (en-têtes). Routes : `GET /invoices/[id]/pdf` et
`GET /quotes/[id]/pdf` (`?download=1` force le téléchargement).

- **Dépendance** : pdfkit (pur JavaScript). Retenu plutôt qu'un navigateur headless (lourd,
  surface d'attaque, indisponible sur beaucoup d'hébergements) ou react-pdf (plus lourd). Il
  reste hors du bundle (`serverExternalPackages`) ; les polices DejaVu Sans sont embarquées
  (`src/server/pdf/fonts`, licence dans `FONTS-LICENSE.txt`) pour que les accents et le rendu
  ne dépendent pas du serveur.
- **Aucun calcul** : le PDF imprime les montants stockés en base (même source que l'écran).
  Une facture émise imprime les coordonnées **figées à l'émission**.
- **Sécurité** : chaque route fait `requireTenant("…:read")` puis lit via le client tenant :
  sans session redirection vers /login, document d'une autre entreprise = 404. Réponse
  `Cache-Control: private, no-store`, `nosniff`, nom de fichier assaini.
- Filigrane « BROUILLON » (brouillons) et « ANNULÉE » (factures annulées), en-tête de tableau
  répété et « Page x / y » sur les longs documents.
- **Limites** : pdfkit ne met pas en forme le texte arabe (droite-gauche) ; les noms en
  alphabet latin sont imprimés correctement. Les mentions légales obligatoires sur une facture
  algérienne (et le montant en lettres) ne sont pas ajoutées : seules les identités saisies par
  l'entreprise (NIF, NIS, RC, AI) sont imprimées. **À valider avec un comptable** avant usage
  réel.

## Tableau de bord

`src/server/services/stats.ts` (permission `stats:read` : OWNER, ADMIN, ACCOUNTANT) et
`src/app/(app)/dashboard/page.tsx`.

- Tous les chiffres sont des **agrégats SQL** via le client tenant (`groupBy` par jour puis
  regroupement par mois en Decimal) : jamais calculés dans le navigateur, jamais d'une autre
  entreprise. Montants en chaînes décimales exactes.
- Définitions : _facturé_ = factures émises / payées en partie / payées (ni brouillon ni
  annulée), TTC, par date de facture ; _encaissé_ = paiements non annulés, par date de
  paiement ; _reste à encaisser_ = total − payé des factures ouvertes ; _en retard_ = reste à
  encaisser dont l'échéance est strictement passée (heure d'Alger).
- Sans `stats:read` (employé, lecture seule) : page sobre sans chiffre financier.
- Graphique en SVG rendu côté serveur, sans bibliothèque : une seule échelle, base à zéro,
  légende, info-bulle par barre, tableau des valeurs. Couleurs `--chart-1` / `--chart-2`
  validées avec le validateur du skill dataviz (écart daltonisme, contraste, bande de
  luminosité) en mode clair **et** sombre ; en dessous de 640 px le graphique défile
  horizontalement plutôt que de rétrécir.
- Pas de cache : les chiffres sont recalculés à chaque affichage. Si une entreprise a de très
  gros volumes, prévoir une table d'agrégats mensuels.

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

## FacturDZ AI (Phase 12)

Page `/ai` (permission `ai:use`) et actions serveur `src/app/(app)/ai/actions.ts` (chacune commence
par `requireTenant("ai:use")`). Services : `ai-drafts.ts` (proposition → aperçu → confirmation),
`ai-assistant.ts` (questions analytiques en lecture seule). Socle : `src/server/ai/` (types,
fournisseurs, schémas Zod, prompts, rapprochement, outils, `runAI`). Détails dans `docs/ai.md`.

## Règle d'arrondi (validée par le propriétaire du produit)

TVA arrondie à 2 décimales **par ligne** (demi-supérieur), Decimal partout, jamais de flottants :

1. HT brut = quantité × prix unitaire ; remise selon le taux de la ligne ; `taxableAmount` = HT net.
2. `taxAmount` = arrondi(taxableAmount × taux / 100, 2) ; TTC ligne = taxableAmount + taxAmount.
3. `totalHT` = Σ taxableAmount ; `totalTVA` = Σ taxAmount déjà arrondis ; `totalTTC` = totalHT + totalTVA.

Implémentation unique : `src/lib/billing.ts` (`computeLine`, `computeDocument`), utilisée par le
serveur (`prepareLines`), l'éditeur (aperçu), les aperçus IA et le PDF (valeurs stockées, aucun
recalcul). Garanties : tests `tests/unit/billing-rounding.test.ts` et contraintes CHECK
`total = subtotal + taxAmount/taxTotal` sur lignes et documents (migration `…_totals_consistency`).
**Ne pas modifier cette règle sans validation explicite.**

## Plans et limites (Phase 16)

Valeurs en base (`subscription_plans`, `usage_limits` : une ligne par limite, `value = null` ou ligne
absente = illimité) ; **rien n'est codé en dur** (les valeurs du seed reprennent l'exemple du cahier des
charges et se modifient en base). Service : `src/server/services/limits.ts`.

- **Période** : mois calendaire en heure d'Alger.
- **Factures** : comptées à l'ÉMISSION (numéro attribué, annulées comprises) ; les brouillons sont
  libres. **Devis** : comptés à la création. Les deux contrôles sont faits **dans la transaction,
  après un verrou de ligne sur l'entreprise** : des émissions simultanées ne dépassent jamais le
  plafond (testé : 7 en parallèle, plafond 3 → exactement 3, numéros 1-2-3 sans trou).
- **IA** : requêtes, jetons et budget USD mensuels, vérifiés avant l'appel au fournisseur ; un refus est
  tracé (`REJECTED_LIMIT`, `LIMIT_EXCEEDED`), n'appelle pas le fournisseur et ne compte pas dans le
  quota. Contrôle « souple » (de rares appels simultanés peuvent dépasser de quelques unités).
- **Abonnement résilié** (`CANCELLED`) : émission, création de devis et IA refusées ; consultation, PDF
  et paiements restent possibles. `TRIALING` et `PAST_DUE` restent actifs (politique à valider).
- **Non appliqué pour l'instant** : `STORAGE_MB` (aucun stockage de fichiers) ; `MEMBERS` (prêt via
  `assertWithinLimit`, aucune fonction d'ajout de membre n'existe encore) ; entreprise sans abonnement
  (anomalie) = aucune limite + alerte dans les logs.
- **Page** `/settings/subscription` (propriétaire, administrateur) : plan, statut, usage et plafonds.
  Le changement de plan se fera depuis l'administration (Phase 17), sans paiement en ligne.

## Administration plateforme (Phase 17)

`src/app/admin/**` (hors du groupe `(app)`, qui exige une entreprise) ; services dans
`src/server/admin/` : `context.ts` (accès), `overview.ts` (lectures transversales),
`manage.ts` (écritures validées + audit). Pages : vue d'ensemble, entreprises (plan/statut),
utilisateurs (suspension), plans et limites, tarifs IA. Limites MEMBERS et STORAGE_MB
modifiables mais pas encore appliquées. Les entreprises sans abonnement (aucune limite) sont
signalées sur la vue d'ensemble.

## Page publique (Phase 20)

`src/app/page.tsx` + `src/components/landing/sections.tsx`. Règle éditoriale : ne décrire que ce
que l'application fait ; aucune statistique, témoignage, logo client ni promesse de conformité
fiscale (un test e2e vérifie l'absence de pourcentages et de formules de preuve sociale). La grille
tarifaire est lue en base (`src/server/plans-public.ts`) : mêmes plans et plafonds que ceux appliqués ;
un plan payant à 0 DA affiche « Tarif communiqué prochainement ». Les captures
(`src/assets/landing/`) viennent de la base de démo et sont légendées comme telles ; à régénérer si
l'interface change nettement. Limites annoncées sur la page : pas de paiement en ligne, pas d'arabe.
