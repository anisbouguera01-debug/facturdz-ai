import { invoiceModel } from "@/server/pdf/model";
import { renderPdf } from "@/server/pdf/render";
import { errorResponse, pdfResponse } from "@/server/pdf/response";
import { getInvoice } from "@/server/services/invoices";
import { requireTenant } from "@/server/tenant/context";

export const runtime = "nodejs";

/** PDF d'une facture : session + appartenance + permission revérifiées, données de l'entreprise courante uniquement. */
export async function GET(request: Request, ctx: RouteContext<"/invoices/[id]/pdf">) {
  try {
    const tenant = await requireTenant("invoices:read");
    const { id } = await ctx.params;
    const invoice = await getInvoice(tenant, id);
    const bytes = await renderPdf(await invoiceModel(tenant, invoice));
    const inline = new URL(request.url).searchParams.get("download") !== "1";
    return pdfResponse(bytes, invoice.invoiceNumber ?? `brouillon-${invoice.id.slice(-6)}`, inline);
  } catch (error) {
    return errorResponse(error, { route: "invoice-pdf" });
  }
}
