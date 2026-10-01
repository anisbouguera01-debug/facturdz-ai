import { dateToISO, todayISO } from "./dates";

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED";

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  REJECTED: "Refusé",
  EXPIRED: "Expiré",
  CONVERTED: "Facturé",
};

/**
 * Transitions autorisées (le serveur les applique ; l'interface ne fait que les proposer).
 * EXPIRED est calculé à l'affichage : un devis envoyé dont la date de validité est passée.
 * CONVERTED est posé par la conversion en facture (Phase 8).
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["CONVERTED"],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export function quoteDisplayStatus(
  status: QuoteStatus,
  expiryDate: Date | null,
  today: string = todayISO(),
): QuoteStatus {
  if (status === "SENT" && expiryDate && dateToISO(expiryDate) < today) return "EXPIRED";
  return status;
}
