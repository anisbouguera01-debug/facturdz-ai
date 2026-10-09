"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmDraftAction, discardDraftAction } from "@/app/(app)/ai/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import { formatAmount, formatMoney } from "@/lib/format";

export interface PreviewData {
  id: string;
  kind: "invoice" | "quote";
  status: string;
  requestedName: string;
  selectedId: string | null;
  candidates: { id: string; name: string }[];
  lines: {
    description: string;
    quantity: string;
    unitPrice: string | null;
    vatRate: string | null;
    discountRate: string;
    inCatalog: boolean;
    subtotal: string | null;
  }[];
  totals: { subtotal: string; taxTotal: string; total: string } | null;
  warnings: string[];
  blockers: string[];
}

export function AiDraftPreview({ draft }: { draft: PreviewData }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(draft.selectedId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = draft.kind === "invoice" ? "facture" : "devis";
  const open = draft.status === "PENDING";
  const canConfirm = open && draft.blockers.length === 0 && customerId !== "";

  return (
    <section
      aria-label="Aperçu"
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-card sm:p-5"
    >
      <h2 className="text-lg font-semibold">
        Aperçu {draft.kind === "invoice" ? "de la facture" : "du devis"} (brouillon)
      </h2>
      {!open ? (
        <FormMessage>Cette proposition n&apos;est plus disponible ({draft.status}).</FormMessage>
      ) : null}
      <div className="grid gap-1.5">
        <label htmlFor="ai-customer" className="text-sm font-medium">
          Client — demandé : « {draft.requestedName} »
        </label>
        <Select id="ai-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— Choisir le client —</option>
          {draft.candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {draft.candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun client correspondant : créez-le d&apos;abord dans « Clients ».
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">Désignation</th>
              <th className="px-2 text-right font-medium">Qté</th>
              <th className="px-2 text-right font-medium">PU HT</th>
              <th className="px-2 text-right font-medium">TVA</th>
              <th className="pl-2 text-right font-medium">Total HT</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {draft.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  {l.description}
                  {!l.inCatalog ? (
                    <span className="ml-2 text-xs text-muted-foreground">(saisie libre)</span>
                  ) : null}
                </td>
                <td className="tabular px-2 text-right">{l.quantity}</td>
                <td className="tabular px-2 text-right">
                  {l.unitPrice ? formatAmount(l.unitPrice) : "—"}
                </td>
                <td className="tabular px-2 text-right">{l.vatRate ? `${l.vatRate} %` : "—"}</td>
                <td className="tabular pl-2 text-right">
                  {l.subtotal ? formatAmount(l.subtotal) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft.totals ? (
        <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Total HT</dt>
          <dd className="tabular text-right">{formatMoney(draft.totals.subtotal)}</dd>
          <dt className="text-muted-foreground">TVA</dt>
          <dd className="tabular text-right">{formatMoney(draft.totals.taxTotal)}</dd>
          <dt className="font-semibold">Total TTC</dt>
          <dd className="tabular text-right font-semibold">{formatMoney(draft.totals.total)}</dd>
        </dl>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Montants recalculés par le serveur ; l&apos;IA ne calcule rien.
      </p>
      {draft.blockers.length > 0 ? (
        <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
          {draft.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {draft.warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
      {open ? (
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={pending || !canConfirm}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await confirmDraftAction(draft.id, customerId || undefined);
                if (!res.ok) return setError(res.error.message);
                router.push(
                  `/${res.data.kind === "invoice" ? "invoices" : "quotes"}/${res.data.id}`,
                );
              })
            }
          >
            {pending ? "Création…" : `Créer le brouillon de ${label}`}
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await discardDraftAction(draft.id);
                if (!res.ok) return setError(res.error.message);
                router.push("/ai");
              })
            }
          >
            Annuler
          </Button>
        </div>
      ) : null}
    </section>
  );
}
