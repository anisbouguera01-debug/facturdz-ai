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
