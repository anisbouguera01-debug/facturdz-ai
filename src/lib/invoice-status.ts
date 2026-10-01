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

/** En retard : émise ou payée en partie, échéance dépassée (date du jour exclue). */
export function displayStatus(
  status: InvoiceStatus,
  dueDate: Date | null,
  today: Date = new Date(),
): DisplayStatus {
  if ((status === "ISSUED" || status === "PARTIALLY_PAID") && dueDate) {
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    if (dueDate.getTime() < todayUtc) return "OVERDUE";
  }
  return status;
}
