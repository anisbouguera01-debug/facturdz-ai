import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABELS, type DisplayStatus } from "@/lib/invoice-status";

const TONE: Record<DisplayStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
  OVERDUE: "danger",
};

export function InvoiceStatusBadge({ status }: { status: DisplayStatus }) {
  return <Badge tone={TONE[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>;
}
