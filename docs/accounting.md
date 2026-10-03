# Validation comptable (Bloc 3)

## Règle appliquée (validée, ne pas modifier sans validation explicite)

Par ligne : `HT brut = arrondi(quantité × PU HT)` ; `remise = arrondi(brut × % / 100)` ;
`HT net = brut − remise` ; `TVA = arrondi(HT net × taux / 100, 2)` ; `TTC ligne = HT net + TVA`.
Document : `totalHT = Σ HT net`, `totalTVA = Σ TVA de ligne arrondies`, `totalTTC = totalHT + totalTVA`.
Arrondi demi-supérieur, `decimal.js` partout (`src/lib/money.ts`, `src/lib/billing.ts`) ; aucun `number`
JavaScript pour un montant. Le serveur recalcule toujours (`prepareLines`) ; l'aperçu du navigateur
et l'aperçu IA utilisent le même module ; contraintes `CHECK` en base sur les totaux.

## Ce qui a été vérifié

- Audit du code : aucun `parseFloat`/`Math.round` sur un montant ; les `Number()` restants ne
  concernent que l'affichage de graphiques, des compteurs et des tarifs d'abonnement.
- Tests : 0 %, 5,5 %, 9 %, 19 % ; remises 0 / 12,5 / 33,33 / 100 % ; quantités décimales
  (0,001 à 999 999,999) ; 100 lignes de 0,03 (TVA par ligne ≠ TVA globale, tranché par la règle) ;
  invariants sur 5 000 documents aléatoires ; indépendance à l'ordre des lignes ; plafond 12 chiffres.
- PDF : numéro, dates, NIF/NIS/RC/AI du vendeur et du client, désignation, quantité, PU HT, remise,
  taux de TVA, montant HT par ligne, Total HT / TVA / TTC, payé / reste à payer, conditions, et
  **ventilation de la TVA par taux** (ajoutée ici : addition des montants stockés, sans nouvel arrondi).
  Le PDF ne recalcule rien.

## Points à faire confirmer par un expert-comptable (non tranchés par le code)

1. La remise est-elle appliquée **avant** l'arrondi du brut ? (ici : brut arrondi, puis remise arrondie.)
2. Mentions obligatoires exactes d'une facture en Algérie (RC, NIF, NIS, AI, mode de règlement,
   droit de timbre en cas de paiement en espèces, mentions de pénalités de retard) : le modèle PDF
   imprime les identifiants et les conditions saisis, mais **ne génère pas** de mention légale
   propre à un régime (timbre, TAP, régime forfaitaire / IFU).
3. Taux de TVA proposés par défaut et leurs libellés (configurés par entreprise, rien en dur).
4. Numérotation continue et conservation légale des factures.
