-- Phase 9 : annulation de paiement (jamais de suppression) et cohérence statut / montant payé.
ALTER TABLE "payments" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "payments" ADD COLUMN "voidReason" TEXT;

-- Un paiement annulé a une date ET un motif.
ALTER TABLE "payments" ADD CONSTRAINT "payments_void_check" CHECK (
  ("voidedAt" IS NULL AND "voidReason" IS NULL) OR ("voidedAt" IS NOT NULL AND "voidReason" IS NOT NULL)
);

-- Le payé ne dépasse jamais le total, et le statut stocké reste cohérent avec le payé.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_check" CHECK (
  "amountPaid" <= "total"
  AND ("status" <> 'PAID' OR "amountPaid" = "total")
  AND ("status" <> 'PARTIALLY_PAID' OR ("amountPaid" > 0 AND "amountPaid" < "total"))
  AND ("status" NOT IN ('DRAFT', 'ISSUED') OR "amountPaid" = 0)
);
