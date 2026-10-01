# FacturDZ AI — Intelligence artificielle

> Conception validée en phase d'analyse. Implémentation : Phases 12 à 15.

## Principe

**L'IA interprète, le backend décide et calcule.** Aucun montant, total, TVA ou solde
n'est calculé par un modèle.

## Abstraction des fournisseurs

```ts
interface AIProvider {
  generateText(req): Promise<AIResult<string>>;
  generateStructuredOutput<T>(req, schema: ZodSchema<T>): Promise<AIResult<T>>;
  generateWithTools(req, tools): Promise<AIResult<string>>;
}
```

Implémentations : `OpenAIProvider`, `GeminiProvider` (SDK officiels). Fournisseur et modèle
par défaut via `AI_PROVIDER` / `AI_MODEL` ; surcharge possible par organisation dans une
liste autorisée.

## Création de documents par l'IA

```
demande → IA → JSON (schéma Zod) → validation → AIDraft (PENDING)
        → rapprochement clients/produits + recalcul serveur → prévisualisation
        → confirmation utilisateur → facture en brouillon
```

JSON invalide : aucune facture, une seule relance de correction, puis erreur.

## Assistant analytique

Outils en **lecture seule** sur liste blanche (chiffre d'affaires, impayés, meilleurs
clients, encaissements). `organizationId` est injecté par le serveur, il n'est jamais un
paramètre que le modèle peut fournir. Résultats agrégés et plafonnés.

## Suivi des coûts

Chaque appel passe par `runAI(ctx, feature, fn)` :

1. vérifie quotas du plan et rate limit ;
2. appelle le fournisseur ;
3. enregistre **toujours** un `AIUsage`, y compris en cas d'erreur ;
4. calcule `estimatedCost` depuis le `ModelPricing` en vigueur à la date de l'appel.

```
coût = inputTokens / 1 000 000 × prixEntrée + outputTokens / 1 000 000 × prixSortie
```

Sans tarif connu, `estimatedCost` vaut `null` (« non estimé »), jamais 0. Le coût est
toujours présenté comme une estimation.

## Prompt injection

Instructions système séparées des données, données utilisateur encadrées comme données,
aucun outil d'écriture ou de suppression, aucun secret dans le contexte, données minimisées.

## État d'implémentation (Phase 12)

- **Fournisseur** : seul le fournisseur simulé (`AI_PROVIDER=mock`) existe. Il est déterministe,
  sans réseau ni coût, et **refusé quand `APP_ENV=production`**. OpenAI (Phase 13) et Gemini
  (Phase 14) s'ajoutent derrière la même interface `AIProvider`.
- **Point d'entrée unique** : `runAI` (permission `ai:use` → limite de débit 20 requêtes/min
  par utilisateur → appel → validation → `AIUsage`). Un `AIUsage` est écrit pour le succès,
  l'erreur fournisseur, la sortie invalide et la limite atteinte ; le coût reste `null`
  jusqu'à la Phase 15. Ni prompt ni réponse ne sont journalisés.
- **Création de documents** (`ai-drafts.ts`) : le modèle ne reçoit que le texte de
  l'utilisateur (encadré par `<demande_utilisateur>`), jamais de clients, produits ni montants.
  Sa sortie JSON est validée par Zod (clés inconnues supprimées : `organizationId`, totaux,
  statut sont ignorés) ; en cas d'invalidité, **une seule** correction est tentée. Client et
  produits sont rapprochés côté serveur ; en cas d'ambiguïté, aucun client n'est présélectionné.
  La proposition (`AIDraft`, 24 h, visible uniquement par son auteur) est prévisualisée avec des
  montants **recalculés par le serveur**, puis confirmée explicitement : la confirmation est
  atomique (une seule réussit), crée un **brouillon** de facture/devis (jamais émis) via les
  services habituels, et l'émission reste une action humaine distincte.
- **Assistant analytique** (`ai-assistant.ts`) : outils en lecture seule en liste blanche
  (`period_figures`, `unpaid_customers`, `top_customers`, `overdue_invoices`), `organizationId`
  injecté par le serveur, résultats plafonnés, droit `stats:read` requis. La réponse est
  affichée avec les « données utilisées » pour vérification.
- **Limites connues** : le fournisseur simulé ne comprend que des formulations simples ; si le
  client demandé n'existe pas, il faut le créer puis refaire la demande.

## Fournisseur OpenAI (Phase 13)

- **Activation** : `AI_PROVIDER=openai`, `OPENAI_API_KEY` et `AI_MODEL` (nom exact du modèle,
  choisi par l'exploitant : aucun modèle par défaut n'est codé). Si l'une des deux variables
  manque, l'IA répond « non configurée » sans appel réseau ni fuite de détail.
- **Implémentation** : `src/server/ai/providers/openai.ts`, API Chat Completions via `fetch`.
  **Aucune dépendance ajoutée** (pas de SDK) : moins de surface d'attaque, un seul fichier à
  maintenir. La clé n'est lue que côté serveur et n'apparaît jamais dans les logs ni les erreurs.
- **Sortie structurée** : mode JSON ; la validation est faite par Zod côté serveur (le mode JSON
  de l'API ne remplace pas la validation). Un contenu non JSON déclenche la relance de correction.
- **Outils** : schémas JSON générés depuis les schémas Zod des outils (liste blanche, lecture
  seule). Outil inconnu = jamais exécuté ; arguments invalides = refusés ; boucle bornée à
  4 tours, le dernier sans outils. Les compteurs de tokens sont cumulés sur tous les tours.
- **Robustesse** : délai maximal de 30 s par appel, une relance sur erreur réseau/429/5xx.
  Le corps des réponses d'erreur n'est jamais journalisé ni renvoyé (il peut citer la requête).
- **Vérification** : tests unitaires contre un faux serveur (`tests/unit/openai-provider.test.ts`).
  **Non testé contre l'API réelle** (réseau non autorisé dans l'environnement de
  développement) : un essai manuel avec une vraie clé est nécessaire avant la mise en production.
- Les tarifs et le coût estimé par appel arrivent en Phase 15.

## Fournisseur Gemini (Phase 14)

- **Activation** : `AI_PROVIDER=gemini`, `GEMINI_API_KEY` et `AI_MODEL` (nom exact du modèle,
  aucun défaut codé). Variable manquante = « non configuré », sans appel réseau.
- **Implémentation** : `src/server/ai/providers/gemini.ts` (API REST `generateContent` via
  `fetch`, aucune dépendance). La clé passe par l'en-tête `x-goog-api-key`, jamais par l'URL.
- **Logique partagée** : `providers/http.ts` (délai de 30 s, une relance sur réseau/429/5xx,
  erreurs génériques sans corps ni clé) est commune à OpenAI et Gemini.
- **Différences gérées** : instruction système séparée (`systemInstruction`), mode JSON par
  `responseMimeType`, schémas d'outils nettoyés des mots-clés non pris en charge, retours d'outils
  en `functionResponse`, jetons de « réflexion » comptés comme jetons de sortie.
- **Garanties identiques à OpenAI** : validation Zod côté serveur, outils en liste blanche et
  lecture seule, boucle bornée à 4 tours, outil inconnu jamais exécuté.
- **Vérification** : faux serveur uniquement (`tests/unit/gemini-provider.test.ts`) ; **non testé
  contre l'API réelle** : essai manuel avec une vraie clé requis avant la production.

## Usage et coûts (Phase 15)

- **Tarifs** : table globale `model_pricing` (prix par million de jetons : entrée, sortie, entrée en
  cache, devise, date d'effet, date de fin). **Aucun prix n'est codé en dur ni inventé** : l'exploitant
  les saisit avec `pnpm ai:pricing --provider openai|gemini --model <modèle> --input <prix>
--output <prix> [--cached <prix>] [--currency USD] [--from AAAA-MM-JJ]`, d'après la grille
  publiée par le fournisseur. Un nouveau tarif ferme le précédent à sa date d'effet (historique
  conservé, date antérieure refusée). Le panneau d'administration (Phase 17) réutilisera cette fonction.
- **Calcul** (`src/server/ai/cost.ts`) : Decimal, 6 décimales. `inputTokens` inclut le cache
  (convention OpenAI/Gemini) : la part en cache est facturée au tarif « cache » s'il existe, sinon
  au tarif d'entrée. Les jetons de réflexion Gemini comptent en sortie.
- **Enregistrement** : `runAI` calcule le coût au moment de l'appel avec le tarif en vigueur et
  garde `pricingId` ; un changement de tarif ultérieur ne réécrit pas l'historique. **Sans tarif
  applicable, le coût reste `null` (« non estimé »), jamais 0.**
- **Consultation** : page `/ai/usage` (droit `stats:read`) : appels réussis/erreurs/réponses
  invalides/refus de limite, jetons, coût estimé par devise, détail par fonctionnalité, et nombre
  d'appels sans tarif. Strictement limitée à l'entreprise ; aucun prompt ni réponse n'est stocké.
- **Limite** : estimation indicative ; la facture du fournisseur fait foi. Les quotas par plan
  (blocage à l'atteinte d'une limite) arrivent en Phase 16.

## Quotas par plan (Phase 16)

`runAI` applique `AI_REQUESTS_PER_MONTH`, `AI_TOKENS_PER_MONTH` et `AI_BUDGET_USD_PER_MONTH` du plan avant
l'appel au fournisseur (voir `docs/architecture.md`, « Plans et limites »). Le budget n'inclut que les appels
dont le coût est estimable : sans tarif enregistré, il ne peut pas être appliqué.
