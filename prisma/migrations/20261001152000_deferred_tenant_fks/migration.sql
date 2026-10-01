-- Clés étrangères internes à une entreprise (ON DELETE NO ACTION) rendues DIFFÉRÉES.
--
-- Pourquoi : la suppression d'une entreprise supprime en cascade, dans la même
-- instruction, ses produits, clients, devis, factures et leurs lignes. Avec une
-- contrainte NO ACTION non différée, PostgreSQL peut vérifier « ligne → produit »
-- avant que la cascade n'ait supprimé la ligne, et refuser la suppression.
-- Différée, la vérification a lieu au COMMIT, une fois la cascade terminée.
--
-- La protection est inchangée : supprimer SEUL un client, un produit, un devis ou une
-- facture encore référencé échoue toujours (au commit).
-- (Prisma ne modélise pas la différabilité : non comparée par `prisma migrate diff`.)

ALTER TABLE "quote_items" ALTER CONSTRAINT "quote_items_productId_organizationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "invoice_items" ALTER CONSTRAINT "invoice_items_productId_organizationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "quotes" ALTER CONSTRAINT "quotes_customerId_organizationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "invoices" ALTER CONSTRAINT "invoices_customerId_organizationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "invoices" ALTER CONSTRAINT "invoices_quoteId_organizationId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payments" ALTER CONSTRAINT "payments_invoiceId_organizationId_fkey" DEFERRABLE INITIALLY DEFERRED;
