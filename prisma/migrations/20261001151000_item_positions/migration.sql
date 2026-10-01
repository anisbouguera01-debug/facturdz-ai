-- CreateIndex
CREATE UNIQUE INDEX "quote_items_quoteId_position_key" ON "quote_items"("quoteId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_invoiceId_position_key" ON "invoice_items"("invoiceId", "position");
