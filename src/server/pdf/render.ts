import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDate, formatMoney, formatAmount } from "@/lib/format";
import { formatRate, Money } from "@/lib/money";
import type { PdfModel, PdfParty } from "./model";

/**
 * Rendu PDF (A4) avec pdfkit : aucun navigateur, aucune requête réseau, police embarquée.
 * Le rendu n'écrit que des valeurs reçues du modèle ; il ne fait aucun calcul de montant
 * (sauf le regroupement par taux de TVA, par simple addition des lignes stockées).
 * Limite connue : pdfkit ne gère pas le texte arabe (mise en forme droite-gauche) ;
 * les noms en alphabet latin s'impriment correctement.
 */
const FONT_DIR = path.join(process.cwd(), "src/server/pdf/fonts");
let fonts: { regular: Buffer; bold: Buffer } | undefined;
function loadFonts() {
  fonts ??= {
    regular: readFileSync(path.join(FONT_DIR, "DejaVuSans.ttf")),
    bold: readFileSync(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")),
  };
  return fonts;
}

const M = 40; // marge
const W = 595.28 - 2 * M; // largeur utile
const INK = "#1f2a24";
const MUTED = "#5d6a62";
const LINE = "#c9d1cc";
const HEAD_BG = "#eef2ef";

// Colonnes du tableau : x, largeur
const COL = {
  desc: { x: M, w: 215 },
  qty: { x: M + 220, w: 45 },
  pu: { x: M + 270, w: 78 },
  disc: { x: M + 353, w: 42 },
  vat: { x: M + 400, w: 40 },
  amount: { x: M + 445, w: W - 445 },
};

const qty = (q: string) => new Money(q).toDecimalPlaces(3).toString().replace(".", ",");

function partyLines(p: PdfParty): string[] {
  const place = [p.commune, p.wilaya].filter(Boolean).join(", ");
  const legal = [
    p.nif ? `NIF : ${p.nif}` : null,
    p.nis ? `NIS : ${p.nis}` : null,
    p.rc ? `RC : ${p.rc}` : null,
    p.articleImposition ? `AI : ${p.articleImposition}` : null,
  ].filter((v): v is string => Boolean(v));
  return [p.address, place, p.phone, p.email, ...legal].filter((v): v is string => Boolean(v));
}

export function renderPdf(model: PdfModel): Promise<Buffer> {
  const { regular, bold } = loadFonts();
  const doc = new PDFDocument({
    size: "A4",
    margin: M,
    bufferPages: true,
    font: regular as unknown as string,
    info: {
      Title: `${model.title} ${model.number ?? "brouillon"}`,
      Author: model.seller.legalName || model.seller.name,
      Creator: "FacturDZ AI",
    },
  });
  doc.registerFont("Sans", regular);
  doc.registerFont("Sans-Bold", bold);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const bottom = () => doc.page.height - M - 24; // réserve pour le pied de page
  const text = (
    s: string,
    x: number,
    y: number,
    opts: {
      w?: number;
      align?: "left" | "right" | "center";
      bold?: boolean;
      size?: number;
      color?: string;
    } = {},
  ) => {
    doc
      .font(opts.bold ? "Sans-Bold" : "Sans")
      .fontSize(opts.size ?? 9)
      .fillColor(opts.color ?? INK)
      .text(s, x, y, {
        width: opts.w,
        align: opts.align ?? "left",
        lineBreak: opts.w !== undefined,
      });
  };

  // ── En-tête : émetteur à gauche, titre/numéro/dates à droite ──
  const sellerName = model.seller.legalName || model.seller.companyName || model.seller.name;
  text(sellerName, M, M, { bold: true, size: 13, w: 270 });
  let y = doc.y + 2;
  for (const l of partyLines(model.seller)) {
    text(l, M, y, { size: 8.5, color: MUTED, w: 270 });
    y = doc.y + 1;
  }
  const leftEnd = y;

  text(model.title.toUpperCase(), 330, M, { align: "right", w: W - 290, bold: true, size: 18 });
  text(model.number ?? "Brouillon non numéroté", 330, M + 26, {
    align: "right",
    w: W - 290,
    bold: true,
    size: 11,
  });
  let ry = M + 46;
  for (const [label, d] of model.dates) {
    text(`${label} : ${formatDate(d)}`, 330, ry, { align: "right", w: W - 290, size: 9 });
    ry += 13;
  }
  if (model.statusLabel) {
    text(model.statusLabel.toUpperCase(), 330, ry + 2, {
      align: "right",
      w: W - 290,
      bold: true,
      size: 10,
      color: "#2f6f4f",
    });
    ry += 16;
  }

  // ── Client ──
  y = Math.max(leftEnd, ry) + 18;
  doc.roundedRect(M, y, 280, 0.1, 0).stroke(LINE);
  text("CLIENT", M, y + 6, { size: 7.5, color: MUTED, bold: true });
  const custName = model.customer.legalName || model.customer.companyName || model.customer.name;
  text(custName, M, y + 18, { bold: true, size: 11, w: 280 });
  let cy = doc.y + 2;
  for (const l of partyLines(model.customer)) {
    text(l, M, cy, { size: 8.5, color: MUTED, w: 280 });
    cy = doc.y + 1;
  }
  y = cy + 16;

  // ── Tableau des lignes ──
  const drawHeader = (at: number) => {
    doc.rect(M, at, W, 20).fill(HEAD_BG);
    const h = (s: string, c: { x: number; w: number }, align: "left" | "right" = "right") =>
      text(s, c.x + (align === "left" ? 4 : 0), at + 6, {
        w: c.w - (align === "left" ? 4 : 4),
        align,
        bold: true,
        size: 8,
        color: MUTED,
      });
    h("Désignation", COL.desc, "left");
    h("Qté", COL.qty);
    h("PU HT", COL.pu);
    h("Remise", COL.disc);
    h("TVA", COL.vat);
    h("Montant HT", COL.amount);
    return at + 24;
  };
  y = drawHeader(y);

  for (const it of model.items) {
    doc.font("Sans").fontSize(9);
    const h = Math.max(doc.heightOfString(it.description, { width: COL.desc.w - 4 }), 11) + 9;
    if (y + h > bottom()) {
      doc.addPage();
      y = drawHeader(M);
    }
    text(it.description, COL.desc.x + 4, y, { w: COL.desc.w - 4 });
    text(qty(it.quantity), COL.qty.x, y, { w: COL.qty.w - 4, align: "right" });
    text(formatAmount(it.unitPrice), COL.pu.x, y, { w: COL.pu.w - 4, align: "right" });
    text(new Money(it.discountRate).gt(0) ? formatRate(it.discountRate) : "—", COL.disc.x, y, {
      w: COL.disc.w - 4,
      align: "right",
      color: MUTED,
    });
    text(formatRate(it.vatRate), COL.vat.x, y, { w: COL.vat.w - 4, align: "right", color: MUTED });
    text(formatAmount(it.subtotal), COL.amount.x, y, { w: COL.amount.w - 4, align: "right" });
    y += h;
    doc
      .moveTo(M, y - 4)
      .lineTo(M + W, y - 4)
      .dash(1, { space: 2 })
      .stroke(LINE)
      .undash();
  }

  // ── Totaux (valeurs stockées, aucun recalcul) ──
  const rows: [string, string, boolean?][] = [];
  if (new Money(model.totals.discountTotal).gt(0))
    rows.push(["dont remises", formatMoney(model.totals.discountTotal, model.currency)]);
  rows.push(["Total HT", formatMoney(model.totals.subtotal, model.currency)]);
  rows.push(["Total TVA", formatMoney(model.totals.taxTotal, model.currency)]);
  rows.push(["Total TTC", formatMoney(model.totals.total, model.currency), true]);
  if (model.payment) {
    rows.push(["Déjà payé", formatMoney(model.payment.paid, model.currency)]);
    rows.push(["Reste à payer", formatMoney(model.payment.remaining, model.currency), true]);
  }
  const boxH = rows.length * 17 + 14;
  if (y + boxH > bottom()) {
    doc.addPage();
    y = M;
  }
  y += 6;
  const bx = M + W - 240;
  for (const [label, value, strong] of rows) {
    if (strong)
      doc
        .moveTo(bx, y - 3)
        .lineTo(M + W, y - 3)
        .undash()
        .stroke(INK);
    text(label, bx, y + 1, {
      w: 110,
      bold: strong,
      size: strong ? 10.5 : 9,
      color: strong ? INK : MUTED,
    });
    text(value, bx + 110, y + 1, { w: 130, align: "right", bold: strong, size: strong ? 10.5 : 9 });
    y += 17;
  }

  // ── Notes et conditions ──
  y += 10;
  const blocks: [string, string][] = [];
  if (model.notes) blocks.push([model.notesLabel, model.notes]);
  if (model.terms) blocks.push([model.termsLabel, model.terms]);
  for (const [label, body] of blocks) {
    doc.font("Sans").fontSize(9);
    const h = doc.heightOfString(body, { width: W }) + 18;
    if (y + h > bottom()) {
      doc.addPage();
      y = M;
    }
    text(label.toUpperCase(), M, y, { size: 7.5, bold: true, color: MUTED });
    text(body, M, y + 11, { w: W, size: 9 });
    y = doc.y + 10;
  }

  // ── Filigrane et pied de page sur chaque page ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (model.watermark) {
      doc.save();
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.fillOpacity(0.08);
      doc.font("Sans-Bold").fontSize(96).fillColor("#000000");
      const w = doc.widthOfString(model.watermark);
      doc.text(model.watermark, (doc.page.width - w) / 2, doc.page.height / 2 - 48, {
        lineBreak: false,
      });
      doc.restore();
    }
    // Le pied de page est sous la marge basse : on la neutralise pour ne pas créer de page.
    const prevBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const footer = `${model.seller.legalName || model.seller.name} · ${model.title} ${model.number ?? "brouillon"}`;
    text(footer, M, doc.page.height - M + 6, { w: W - 80, size: 7.5, color: MUTED });
    text(`Page ${i - range.start + 1} / ${range.count}`, M + W - 80, doc.page.height - M + 6, {
      w: 80,
      align: "right",
      size: 7.5,
      color: MUTED,
    });
    doc.page.margins.bottom = prevBottom;
  }

  doc.end();
  return done;
}
