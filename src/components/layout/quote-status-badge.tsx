import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/quote-status";

const TONE: Record<QuoteStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "warning",
  CONVERTED: "success",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge tone={TONE[status]}>{QUOTE_STATUS_LABELS[status]}</Badge>;
}
