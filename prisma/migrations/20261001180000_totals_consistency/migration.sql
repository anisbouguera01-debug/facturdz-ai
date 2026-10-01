-- Règle d'arrondi : TVA arrondie par ligne, totaux = sommes des lignes.
-- Invariant garanti en base : TTC = HT net + TVA, aussi bien par ligne que par document.
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_total_check" CHECK ("total" = "subtotal" + "taxAmount");
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_total_check" CHECK ("total" = "subtotal" + "taxAmount");
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_total_check" CHECK ("total" = "subtotal" + "taxTotal");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_check" CHECK ("total" = "subtotal" + "taxTotal");
