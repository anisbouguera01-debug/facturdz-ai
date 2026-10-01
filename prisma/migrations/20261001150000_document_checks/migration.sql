-- Contraintes CHECK supplémentaires sur les documents (hors Prisma, voir migration init).

-- Un devis envoyé (ou au-delà) a obligatoirement un numéro ; un brouillon n'en a pas.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_number_status_check" CHECK (
  ("status" = 'DRAFT' AND "number" IS NULL)
  OR ("status" <> 'DRAFT' AND "number" IS NOT NULL)
);

-- Dates cohérentes.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_dates_check" CHECK (
  "expiryDate" IS NULL OR "expiryDate" >= "issueDate"
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_dates_check" CHECK (
  "dueDate" IS NULL OR "dueDate" >= "issueDate"
);

-- Une ligne a une position positive et unique dans son document.
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_position_check" CHECK ("position" >= 1);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_position_check" CHECK ("position" >= 1);
