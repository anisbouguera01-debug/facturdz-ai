# Tests (Phase 19)

| Commande             | Rôle                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`          | unitaires + intégration (PostgreSQL de test, `TEST_DATABASE_URL`)                                                                        |
| `pnpm test:coverage` | idem + seuil de couverture (lignes/instructions/fonctions 85 %, branches 70 %)                                                           |
| `pnpm check:bundle`  | après `pnpm build` : aucun secret dans `.next/static` (valeurs d'environnement, noms de clés, formes de clés OpenAI/Google, URL de base) |
| `pnpm test:e2e`      | parcours navigateur (Playwright) contre l'application compilée et la base de démo                                                        |

E2E en local : `pnpm build && pnpm db:reset:local && pnpm start -p 3000`, puis
`E2E_CHROMIUM=/chemin/chromium pnpm test:e2e` (ou `pnpm exec playwright install chromium`).
Les tests ne se connectent qu'une fois par compte : la connexion est limitée à 5/min (voulu).

## Tests critiques du cahier des charges

| #   | Exigence                                                | Où                                                                        |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | A ne voit pas l'organisation B                          | `integration/tenant-db`, `tenant-context`, e2e « isolation »              |
| 2   | Facture refusée avec un client d'une autre organisation | `integration/invoices`, `database-constraints` (clés composites)          |
| 3   | Numéro de facture unique                                | `integration/invoices` (25 émissions simultanées), `database-constraints` |
| 4   | Montants cohérents                                      | `unit/billing*`, `integration/invoices`, CHECK en base                    |
| 5   | Réponse IA invalide : aucune facture                    | `integration/ai`, e2e « assistant IA »                                    |
| 6   | Sans permission : pas d'administration                  | `integration/admin`, `unit/security-guards`, e2e « administration »       |
| 7   | Clés API jamais au navigateur                           | `unit/security-guards` (imports client, NEXT_PUBLIC_), `check:bundle`     |

Autres : PDF (`integration/pdf`, e2e), permissions (`unit/permissions`, par service), TVA/arrondi,
limites et abonnements, coûts IA, fournisseurs IA (faux serveur), journal d'audit, débit.

## Limites connues

- OpenAI/Gemini testés sur faux serveur uniquement (jamais contre les vraies API).
- Pas de test de charge ni de test d'accessibilité automatisé (axe) ; à envisager avant la production.
- Le CI GitHub (dont le job e2e) n'a pas encore été observé en exécution réelle.
