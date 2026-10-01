import { quoteModel } from "@/server/pdf/model";
import { renderPdf } from "@/server/pdf/render";
import { errorResponse, pdfResponse } from "@/server/pdf/response";
import { getQuote } from "@/server/services/quotes";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { requireTenant } from "@/server/tenant/context";

export const runtime = "nodejs";

/** PDF d'un devis : session + appartenance + permission revérifiées. */
export async function GET(request: Request, ctx: RouteContext<"/quotes/[id]/pdf">) {
  try {
    const tenant = await requireTenant("quotes:read");
    // Le rendu PDF est coûteux : 20 par minute et par utilisateur.
    await consumeRateLimit("pdf:user", tenant.userId, 20, 60);
    const { id } = await ctx.params;
    const quote = await getQuote(tenant, id);
    const bytes = await renderPdf(await quoteModel(tenant, quote));
    const inline = new URL(request.url).searchParams.get("download") !== "1";
    return pdfResponse(bytes, quote.number ?? `brouillon-${quote.id.slice(-6)}`, inline);
  } catch (error) {
    return errorResponse(error, { route: "quote-pdf" });
  }
}
