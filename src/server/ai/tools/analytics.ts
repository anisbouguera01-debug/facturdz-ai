import "server-only";
import { z } from "zod";
import {
  getOverdueInvoices,
  getPeriodFigures,
  getTopCustomers,
  getUnpaidByCustomer,
  PERIODS,
} from "@/server/services/stats";
import type { TenantContext } from "@/server/tenant/resolve";
import type { AITool } from "../types";

/**
 * Outils de l'assistant analytique : LISTE BLANCHE, LECTURE SEULE.
 * - L'entreprise vient du contexte serveur (`ctx.db`) : aucun paramètre d'outil ne permet de
 *   désigner une autre entreprise, quoi que dise le modèle ou la demande de l'utilisateur.
 * - Chaque outil revérifie la permission `stats:read` (via le service) et renvoie un résultat
 *   agrégé et plafonné, jamais la base brute.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

const period = z.enum(PERIODS).describe("THIS_MONTH, LAST_MONTH, THIS_YEAR ou LAST_12_MONTHS");

export function analyticsTools(ctx: Ctx): AITool[] {
  const tools: AITool[] = [
    {
      name: "period_figures",
      description:
        "Chiffre d'affaires facturé (HT, TVA, TTC), nombre de factures et montant encaissé sur une période.",
      parameters: z.object({ period }),
      execute: (a: { period: (typeof PERIODS)[number] }) => getPeriodFigures(ctx, a.period),
    } as AITool<{ period: (typeof PERIODS)[number] }> as AITool,
    {
      name: "unpaid_customers",
      description: "Clients ayant des factures impayées, avec le reste à payer (10 maximum).",
      parameters: z.object({}),
      execute: () => getUnpaidByCustomer(ctx, 10),
    },
    {
      name: "top_customers",
      description: "Meilleurs clients par chiffre d'affaires TTC sur une période (5 maximum).",
      parameters: z.object({ period }),
      execute: (a: { period: (typeof PERIODS)[number] }) => getTopCustomers(ctx, a.period, 5),
    } as AITool<{ period: (typeof PERIODS)[number] }> as AITool,
    {
      name: "overdue_invoices",
      description: "Factures dont l'échéance est dépassée et non soldées (10 maximum).",
      parameters: z.object({}),
      execute: () => getOverdueInvoices(ctx),
    },
  ];
  return tools;
}
