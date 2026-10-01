/**
 * Rôles et permissions d'organisation (RBAC).
 *
 * Module pur, sans dépendance serveur : utilisable aussi côté client pour
 * masquer un bouton. L'autorisation réelle est TOUJOURS revérifiée côté serveur
 * (requireTenant), jamais déduite de l'interface.
 */
export const ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "EMPLOYEE", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "organization:manage", // informations légales, logo, paramètres de facturation
  "organization:delete",
  "subscription:manage",
  "members:manage",
  "settings:manage",
  "customers:read",
  "customers:write",
  "customers:delete",
  "products:read",
  "products:write",
  "products:delete",
  "quotes:read",
  "quotes:write",
  "quotes:delete",
  "invoices:read",
  "invoices:create",
  "invoices:update",
  "invoices:issue", // émettre (numéroter) une facture
  "invoices:cancel",
  "invoices:delete", // brouillons uniquement
  "payments:read",
  "payments:write",
  "stats:read",
  "ai:use",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ALL: Permission[] = [
  "customers:read",
  "products:read",
  "quotes:read",
  "invoices:read",
  "payments:read",
];

/**
 * Matrice des rôles.
 * - OWNER : tout, dont suppression de l'organisation et abonnement.
 * - ADMIN : tout sauf suppression de l'organisation et abonnement.
 * - ACCOUNTANT : facturation complète, paiements, statistiques ; pas de gestion
 *   des membres ni des paramètres ; ne supprime rien.
 * - EMPLOYEE : prépare clients, devis et brouillons de factures ; n'émet pas,
 *   n'encaisse pas, ne voit pas les statistiques.
 * - VIEWER : lecture seule, sans IA.
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((p) => p !== "organization:delete" && p !== "subscription:manage"),
  ACCOUNTANT: [
    ...READ_ALL,
    "customers:write",
    "quotes:write",
    "invoices:create",
    "invoices:update",
    "invoices:issue",
    "invoices:cancel",
    "payments:write",
    "stats:read",
    "ai:use",
  ],
  EMPLOYEE: [
    ...READ_ALL,
    "customers:write",
    "quotes:write",
    "invoices:create",
    "invoices:update",
    "ai:use",
  ],
  VIEWER: READ_ALL,
};

export function permissionsFor(role: Role): ReadonlySet<Permission> {
  return new Set(MATRIX[role]);
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  ACCOUNTANT: "Comptable",
  EMPLOYEE: "Employé",
  VIEWER: "Lecture seule",
};
