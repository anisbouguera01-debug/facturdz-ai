# Design system (refonte visuelle)

Aucun changement métier, d'autorisation, de schéma ou de règle comptable : uniquement la présentation.

- **Jetons** (`src/app/globals.css`) : fond `#f7f8fc`, cartes blanches, principal bleu nuit `#172554`, accent indigo
  `#4f46e5` (focus, navigation active, liens), succès/alerte/erreur sobres, rayons et ombres légères ; thème sombre
  équivalent. Le « AI » du **logo garde sa couleur d'origine** (`--brand`) : composant `ui/logo.tsx`, à ne pas modifier.
- **Composants** (`src/components/ui`) : `Button` (primaire, secondaire, ghost, destructif), `Input/Select/Textarea`,
  `Badge`, `Card/CardHeader`, `PageHeader`, `StatCard`, `EmptyState`, `Skeleton`, `Dialog/ConfirmDialog` (élément
  `<dialog>` natif), `FormMessage` (erreur, info, succès, avertissement), `Pagination`, `Field`.
- **Structure** (`components/layout/app-shell.tsx`) : barre latérale repliable (préférence mémorisée dans le navigateur),
  tiroir tactile sur mobile, organisation active, profil et déconnexion. Les entrées viennent de `NAV_ITEMS`
  (`src/app/(app)/layout.tsx`), filtrées par permission : aucun lien vers une page inexistante ou interdite.
- **Responsive** : testé à 320, 375, 390, 768, 1024, 1280 et 1440 px (aucun débordement horizontal) ; tableaux
  remplacés par des cartes sous 768 px ; barre d'enregistrement fixe sur mobile dans l'éditeur de facture.
- **Accessibilité** : axe-core (WCAG 2 A/AA) sans violation sur les pages publiques et authentifiées, en clair et en sombre ;
  focus visible, `prefers-reduced-motion` respecté, libellés et erreurs annoncés.
- **Montants** : toujours issus de `lib/billing` (serveur et aperçu partagent le même module Decimal) ; chiffres alignés
  (`.tabular`), jamais de calcul flottant.
- Pas de `loading.tsx` sur les routes à identifiant : le streaming enverrait 200 avant `notFound()` (isolation entre entreprises).

## Phase 22 : finition (pages détail, admin, légales, filtres, impression)

- **Pages détail** (`src/components/layout/detail.tsx`) : `DetailHeader` (retour, titre, badges, sous-titre, actions), `DetailLayout` (colonne principale + latérale, pistes `minmax(0,1fr)` pour ne jamais déborder), `Panel`, `InfoList`. Utilisées par devis, facture, client et produit. Rien n'est affiché qui ne soit fourni par le serveur : pas de fil d'activité (le journal d'audit est technique, pas un historique métier fiable) ni de documents liés au produit (le serveur ne fournit que le nombre d'utilisations).
- **Filtre de période des factures** (`src/lib/periods.ts`) : Aujourd'hui, Cette semaine (dimanche à samedi), Ce mois, Mois précédent, dates personnalisées. Appliqué dans `listInvoices` sur la date d'émission, bornes incluses, jour courant en Africa/Algiers. Dates invalides ou inversées : aucun filtre, message d'erreur affiché.
- **Impression** : bouton « Imprimer » sur devis et facture ; styles `print:` + `@media print` (navigation, boutons et panneaux masqués, lignes non coupées, valeurs stockées uniquement).
- **Administration** : navigation avec page active, filtres de statut serveur (utilisateurs : actif/suspendu ; entreprises : abonnement), confirmation par `ConfirmDialog` avant suspension, résiliation d'abonnement et désactivation de plan. La garde SUPER_ADMIN (`requireSuperAdminPage`, `resolveAdmin`) est inchangée.
- **Pages légales** : `LegalDocument` génère le sommaire à partir des `<H2>` (aucune liste à maintenir), largeur de lecture ~46 rem, sommaire repliable sur mobile.
- **Assistant IA** : réponses formatées (paragraphes, listes), bouton « Réessayer », zone de saisie collante sur mobile. Toujours aucun historique persistant.
- **Accessibilité** : les zones à défilement horizontal sont focalisables et nommées (`role="region"`).
