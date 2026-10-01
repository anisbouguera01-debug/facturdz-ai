import "server-only";
import { errorResponse } from "@/server/errors";

/** Réponse PDF : jamais mise en cache (donnée privée), nom de fichier sûr, pas de sniffing. */
export function pdfResponse(bytes: Buffer, baseName: string, inline: boolean): Response {
  const safe = baseName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "document";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safe}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export { errorResponse };
