/**
 * PDF : rendu à partir de vraies données, sans rien recalculer, avec pagination
 * et filigranes. L'extraction de texte utilise pdftotext (poppler) quand il est installé.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayISO } from "@/lib/dates";
import { invoiceModel, quoteModel } from "@/server/pdf/model";
import { renderPdf } from "@/server/pdf/render";
import { cancelInvoice, createInvoice, getInvoice, issueInvoice } from "@/server/services/invoices";
import { recordPayment } from "@/server/services/payments";
import { createQuote, getQuote } from "@/server/services/quotes";
import { createTaxRate } from "@/server/services/tax-rates";
import { createTenantContext, testDb } from "./helpers";

afterAll(() => testDb().$disconnect());

const hasPoppler = spawnSync("pdftotext", ["-v"]).error === undefined;
const today = todayISO();
let T: Awaited<ReturnType<typeof createTenantContext>>;

function text(pdf: Buffer): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "pdf-")), "doc.pdf");
  writeFileSync(file, pdf);
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
}
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
const line = (i = 0) => ({
  description: `Prestation ${i} avec accents é è à ç`,
  quantity: "10",
  unitPrice: "85000",
  vatRate: "19",
});

beforeAll(async () => {
  T = await createTenantContext("OWNER", "PDF");
  await createTaxRate(T.ctx, { label: "TVA 19", rate: "19" });
  await T.ctx.db.organization.update({
    where: { id: T.org.id },
    data: { legalName: "SARL Démo Éclair", nif: "NIF-TEST-1" },
  });
});

describe("PDF facture", () => {
  it("génère un PDF valide avec numéro, montants stockés, paiement et coordonnées figées", async () => {
    const d = await createInvoice(T.ctx, {
      customerId: T.customer.id,
      issueDate: today,
      terms: "Paiement à 30 jours",
      items: [line(1), { ...line(2), quantity: "5", unitPrice: "25000", discountRate: "10" }],
    });
    const { number } = await issueInvoice(T.ctx, d.id);
    await recordPayment(T.ctx, {
      invoiceId: d.id,
      amount: "200000",
      paymentDate: today,
      method: "CASH",
    });
    const inv = await getInvoice(T.ctx, d.id);
    const pdf = await renderPdf(await invoiceModel(T.ctx, inv));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(pdf)).toBe(1);
    if (!hasPoppler) return;
    const t = text(pdf).replace(/ | /g, " ");
    expect(t).toContain(number);
    expect(t).toContain("SARL Démo Éclair");
    expect(t).toContain("NIF : NIF-TEST-1");
    expect(t).toContain("Prestation 1 avec accents é è à ç");
    // Mêmes montants que ceux stockés (1 011 500 + 133 875 = 1 145 375 TTC)
    expect(inv.total).toBe("1145375.00");
    expect(t).toContain("1 145 375,00 DA");
    expect(t).toContain("200 000,00 DA");
    expect(t).toContain("945 375,00 DA");
    expect(t).toContain("Paiement à 30 jours");
  });

  it("pagine les longues factures (en-tête de tableau répété) et indique le numéro de page", async () => {
    const d = await createInvoice(T.ctx, {
      customerId: T.customer.id,
      issueDate: today,
      items: Array.from({ length: 120 }, (_, i) => line(i + 1)),
    });
    const pdf = await renderPdf(await invoiceModel(T.ctx, await getInvoice(T.ctx, d.id)));
    expect(pages(pdf)).toBeGreaterThan(3);
    if (!hasPoppler) return;
    const t = text(pdf);
    expect(t).toContain("Page 1 / ");
    expect(t).toContain("Prestation 120");
    expect((t.match(/Désignation/g) ?? []).length).toBe(pages(pdf));
  });

  it("filigrane BROUILLON pour un brouillon, ANNULÉE pour une facture annulée", async () => {
    const d = await createInvoice(T.ctx, {
      customerId: T.customer.id,
      issueDate: today,
      items: [line()],
    });
    const draftModel = await invoiceModel(T.ctx, await getInvoice(T.ctx, d.id));
    expect(draftModel.watermark).toBe("BROUILLON");
    expect(draftModel.number).toBeNull();
    await issueInvoice(T.ctx, d.id);
    await cancelInvoice(T.ctx, d.id);
    const cancelled = await invoiceModel(T.ctx, await getInvoice(T.ctx, d.id));
    expect(cancelled.watermark).toBe("ANNULÉE");
    expect(cancelled.payment).toBeNull();
    // Le filigrane est pivoté : pdftotext ne le restitue pas de façon fiable, on vérifie le modèle
    // et la validité du rendu (contrôle visuel fait à la main).
    const pdf = await renderPdf(cancelled);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("ne contient que les données de l'entreprise courante (client figé à l'émission)", async () => {
    const t2 = await createTenantContext("OWNER", "PDF2");
    await createTaxRate(t2.ctx, { label: "TVA", rate: "19" });
    const d = await createInvoice(t2.ctx, {
      customerId: t2.customer.id,
      issueDate: today,
      items: [line()],
    });
    await issueInvoice(t2.ctx, d.id);
    await t2.ctx.db.customer.update({ where: { id: t2.customer.id }, data: { name: "Renommé" } });
    const model = await invoiceModel(t2.ctx, await getInvoice(t2.ctx, d.id));
    expect(model.customer.name).toBe(t2.customer.name);
    expect(JSON.stringify(model)).not.toContain(T.org.name);
  });
});

describe("PDF devis", () => {
  it("génère un devis avec sa date de validité", async () => {
    const q = await createQuote(T.ctx, {
      customerId: T.customer.id,
      issueDate: today,
      expiryDate: today,
      items: [line()],
    });
    const model = await quoteModel(T.ctx, await getQuote(T.ctx, q.id));
    expect(model.watermark).toBe("BROUILLON");
    const pdf = await renderPdf(model);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (hasPoppler) {
      const t = text(pdf);
      expect(t).toContain("DEVIS");
      expect(t).toContain("Valable jusqu'au");
    }
  });
});
