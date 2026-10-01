import { dateToISO, todayISO } from "./dates";

/** Libellés et état « en retard » des factures (OVERDUE est calculé, jamais stocké). */
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type DisplayStatus = InvoiceStatus | "OVERDUE";

export const INVOICE_STATUS_LABELS: Record<DisplayStatus, string> = {
  DRAFT: "Brouillon",
  ISSUED: "Émise",
  PARTIALLY_PAID: "Payée en partie",
  PAID: "Payée",
  CANCELLED: "Annulée",
  OVERDUE: "En retard",
};

/** En retard : émise ou payée en partie, échéance dépassée (jour d'échéance non compris, heure d'Alger). */
export function displayStatus(
  status: InvoiceStatus,
  dueDate: Date | null,
  today: string = todayISO(),
): DisplayStatus {
  if (
    (status === "ISSUED" || status === "PARTIALLY_PAID") &&
    dueDate &&
    dateToISO(dueDate) < today
  ) {
    return "OVERDUE";
  }
  return status;
}
