import "server-only";
import type { ZodType } from "zod";
import { formatMoney } from "@/lib/format";
import type { AIProvider, AIRequest, AIResult, AITool, AIToolCall, AIUsageReport } from "../types";

/**
 * Fournisseur de DÉMONSTRATION : aucun appel réseau, aucun coût, déterministe.
 * Il sert au développement, à la démo et aux tests ; il est REFUSÉ en production (env.ts).
 * Il ne « comprend » que des formulations simples (voir `parseRequest`) : ce n'est pas une IA.
 * En test, `mockControl.script` permet de simuler n'importe quelle réponse du modèle
 * (JSON invalide, tentative d'injection…) et `mockControl.requests` de voir ce qu'il a reçu.
 */
export const mockControl = {
  script: [] as unknown[],
  requests: [] as AIRequest[],
  reset() {
    this.script = [];
    this.requests = [];
  },
};

const tokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));
const usageOf = (input: string, output: string): AIUsageReport => ({
  inputTokens: tokens(input),
  cachedInputTokens: 0,
  outputTokens: tokens(output),
});

function unframe(text: string): string {
  return (
    text.match(
      /<(?:demande|question)_utilisateur>\n?([\s\S]*?)\n?<\/(?:demande|question)_utilisateur>/,
    )?.[1] ?? text
  );
}

const num = (s: string) => s.replace(/\s/g, "").replace(",", ".");

export function parseRequest(raw: string): unknown {
  const text = unframe(raw).trim();
  const isQuote = /\bdevis\b/i.test(text);
  const isInvoice = /\bfacture\b/i.test(text);
  if (
    !/(cr[ée]+|fais|[ée]tablis|g[ée]n[èe]re|pr[ée]pare|[ée]mets)/i.test(text) ||
    (!isQuote && !isInvoice)
  ) {
    return { action: "UNSUPPORTED", reason: "Je sais seulement créer une facture ou un devis." };
  }
  const customer = text.match(/\bpour\s+(.+?)\s+(?:avec|:)\s+/i)?.[1]?.trim();
  const itemsText = text.match(/\b(?:avec|:)\s+(.+)$/i)?.[1];
  if (!customer || !itemsText)
    return { action: "UNSUPPORTED", reason: "Client ou lignes introuvables." };

  let rest = itemsText;
  const grab = (re: RegExp) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], " ");
    return m?.[1];
  };
  const vat = grab(/\bTVA\s*(?:à|de|:)?\s*(\d+(?:[.,]\d+)?)\s*%/i);
  const discount = grab(/\bremise\s*(?:de|:)?\s*(\d+(?:[.,]\d+)?)\s*%/i);
  const due = grab(/\b[ée]ch[ée]ance\s*(?:le|:)?\s*(\d{4}-\d{2}-\d{2})/i);
  const date = grab(/\b(?:daté|date|en date)\s*(?:du|le|:)?\s*(\d{4}-\d{2}-\d{2})/i);

  const items = rest
    .split(/\s+et\s+|;\s*|,\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(
        /^(\d+(?:[.,]\d+)?)\s+(.+?)(?:\s+(?:à|a|au prix de)\s+([\d\s.,]+?)\s*(?:DA|DZD|dinars?)?)?\s*(?:chacun|pièce|l'unité)?\s*$/i,
      );
      if (!m) return null;
      return {
        description: m[2].trim().replace(/^./, (c) => c.toUpperCase()),
        quantity: Number(num(m[1])),
        ...(m[3] ? { unitPrice: Number(num(m[3])) } : {}),
        ...(vat ? { vatRate: Number(num(vat)) } : {}),
        ...(discount ? { discountRate: Number(num(discount)) } : {}),
      };
    });
  if (items.length === 0 || items.some((i) => i === null))
    return { action: "UNSUPPORTED", reason: "Je n'ai pas compris les lignes." };
  return {
    action: isQuote ? "CREATE_QUOTE" : "CREATE_INVOICE",
    customer: { name: customer },
    items,
    ...(date ? { issueDate: date } : {}),
    ...(due ? { dueDate: due, expiryDate: due } : {}),
  };
}

function pickTools(question: string): { tool: string; args: unknown }[] {
  const q = question.toLowerCase();
  const period = /mois dernier|mois pr[ée]c[ée]dent/.test(q)
    ? "LAST_MONTH"
    : /ann[ée]e/.test(q)
      ? "THIS_YEAR"
      : /12 mois|douze mois/.test(q)
        ? "LAST_12_MONTHS"
        : "THIS_MONTH";
  const calls: { tool: string; args: unknown }[] = [];
  if (/retard/.test(q)) calls.push({ tool: "overdue_invoices", args: {} });
  else if (/impay/.test(q)) calls.push({ tool: "unpaid_customers", args: {} });
  else if (/meilleur|plus gros|plus grand|top/.test(q))
    calls.push({ tool: "top_customers", args: { period } });
  else if (/factur|encaiss|chiffre|ca\b|pay/.test(q))
    calls.push({ tool: "period_figures", args: { period } });
  return calls;
}

interface PeriodResult {
  from: string;
  to: string;
  invoiceCount: number;
  invoicedInclTax: string;
  invoicedExclTax: string;
  collected: string;
}
interface UnpaidRow {
  customer: string;
  remaining: string;
}
interface TopResult {
  from: string;
  to: string;
  customers: { customer: string; invoicedInclTax: string }[];
}
interface OverdueRow {
  invoiceNumber: string | null;
  customer: string;
  remaining: string;
}

function compose(calls: AIToolCall[]): string {
  if (calls.length === 0)
    return "Je ne peux répondre qu'aux questions sur le facturé, l'encaissé, les impayés, les retards et les meilleurs clients.";
  const out: string[] = [];
  for (const c of calls) {
    if (c.tool === "period_figures") {
      const r = c.result as PeriodResult;
      out.push(
        `Sur la période ${r.from} → ${r.to} : ${r.invoiceCount} facture(s) pour ${formatMoney(r.invoicedInclTax)} TTC (${formatMoney(r.invoicedExclTax)} HT) ; encaissé : ${formatMoney(r.collected)}.`,
      );
    } else if (c.tool === "unpaid_customers") {
      const r = c.result as UnpaidRow[];
      out.push(
        r.length
          ? "Clients avec impayés : " +
              r.map((x) => `${x.customer} (${formatMoney(x.remaining)})`).join(" ; ") +
              "."
          : "Aucun client n'a de facture impayée.",
      );
    } else if (c.tool === "top_customers") {
      const r = c.result as TopResult;
      out.push(
        r.customers.length
          ? `Meilleurs clients (${r.from} → ${r.to}) : ` +
              r.customers
                .map((x, i) => `${i + 1}. ${x.customer} (${formatMoney(x.invoicedInclTax)})`)
                .join(" ; ") +
              "."
          : "Aucune facture émise sur cette période.",
      );
    } else if (c.tool === "overdue_invoices") {
      const r = c.result as OverdueRow[];
      out.push(
        r.length
          ? "Factures en retard : " +
              r
                .map((x) => `${x.invoiceNumber} ${x.customer} (${formatMoney(x.remaining)})`)
                .join(" ; ") +
              "."
          : "Aucune facture en retard.",
      );
    }
  }
  return out.join(" ");
}

export class MockProvider implements AIProvider {
  readonly id = "MOCK" as const;
  readonly model = "mock-demo";

  async generateText(req: AIRequest): Promise<AIResult<string>> {
    mockControl.requests.push(req);
    const text = "Mode démonstration : aucune IA réelle n'est connectée.";
    return { data: text, provider: this.id, model: this.model, usage: usageOf(req.user, text) };
  }

  async generateStructuredOutput<T>(
    req: AIRequest,
    schema: ZodType<T>,
  ): Promise<AIResult<unknown>> {
    void schema;
    mockControl.requests.push(req);
    let data: unknown;
    if (mockControl.script.length > 0) {
      const next = mockControl.script.shift();
      if (next instanceof Error) throw next;
      data = next;
    } else {
      data = parseRequest(req.user);
    }
    return {
      data,
      provider: this.id,
      model: this.model,
      providerRequestId: `mock-${mockControl.requests.length}`,
      usage: usageOf(req.system + req.user, JSON.stringify(data) ?? ""),
    };
  }

  async generateWithTools(req: AIRequest, tools: AITool[]) {
    mockControl.requests.push(req);
    const calls: AIToolCall[] = [];
    for (const wanted of pickTools(unframe(req.user))) {
      const tool = tools.find((t) => t.name === wanted.tool);
      if (!tool) continue; // outil inconnu : ignoré, jamais exécuté
      const args = tool.parameters.parse(wanted.args);
      calls.push({ tool: tool.name, args, result: await tool.execute(args) });
    }
    const text = compose(calls);
    return {
      data: { text, calls },
      provider: this.id,
      model: this.model,
      usage: usageOf(req.system + req.user + JSON.stringify(calls), text),
    };
  }
}
