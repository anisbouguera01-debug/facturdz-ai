"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  setPlanLimitAction,
  setPricingAction,
  setSubscriptionAction,
  setUserStatusAction,
  updatePlanAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionResult } from "@/server/errors";

function useAdminAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  function run(fn: () => Promise<ActionResult<unknown>>) {
    setError(null);
    setDone(false);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error.message);
      else {
        setDone(true);
        router.refresh();
      }
    });
  }
  const message = error ? (
    <FormMessage>{error}</FormMessage>
  ) : done ? (
    <FormMessage tone="info">Enregistré.</FormMessage>
  ) : null;
  return { pending, run, message };
}

const STATUSES = [
  ["ACTIVE", "Actif"],
  ["TRIALING", "Essai"],
  ["PAST_DUE", "Paiement en retard"],
  ["CANCELLED", "Résilié"],
] as const;

export function SubscriptionForm({
  organizationId,
  plans,
  planCode,
  status,
}: {
  organizationId: string;
  plans: { code: string; name: string }[];
  planCode: string | null;
  status: string | null;
}) {
  const { pending, run, message } = useAdminAction();
  const [plan, setPlan] = useState(planCode ?? plans[0]?.code ?? "");
  const [st, setSt] = useState(status ?? "ACTIVE");
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Plan"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="h-9 w-auto"
        >
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Statut"
          value={st}
          onChange={(e) => setSt(e.target.value)}
          className="h-9 w-auto"
        >
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              setSubscriptionAction({
                organizationId,
                planCode: plan,
                status: st as (typeof STATUSES)[number][0],
              }),
            )
          }
        >
          Appliquer
        </Button>
      </div>
      {message}
    </div>
  );
}

export function UserStatusButton({
  userId,
  status,
  disabled,
}: {
  userId: string;
  status: string;
  disabled?: boolean;
}) {
  const { pending, run, message } = useAdminAction();
  const suspended = status === "SUSPENDED";
  return (
    <div className="grid gap-1">
      <Button
        size="sm"
        variant={suspended ? "secondary" : "destructive"}
        disabled={pending || disabled}
        onClick={() => {
          if (!suspended && !window.confirm("Suspendre ce compte et fermer ses sessions ?")) return;
          run(() => setUserStatusAction({ userId, status: suspended ? "ACTIVE" : "SUSPENDED" }));
        }}
      >
        {suspended ? "Réactiver" : "Suspendre"}
      </Button>
      {message}
    </div>
  );
}

const LIMIT_LABELS: Record<string, string> = {
  INVOICES_PER_MONTH: "Factures / mois",
  QUOTES_PER_MONTH: "Devis / mois",
  MEMBERS: "Membres (non appliqué)",
  STORAGE_MB: "Stockage Mo (non appliqué)",
  AI_REQUESTS_PER_MONTH: "Requêtes IA / mois",
  AI_TOKENS_PER_MONTH: "Jetons IA / mois",
  AI_BUDGET_USD_PER_MONTH: "Budget IA USD / mois",
};

export function PlanEditor({
  plan,
}: {
  plan: {
    id: string;
    code: string;
    name: string;
    priceMonthly: string;
    active: boolean;
    limits: Record<string, string | null>;
  };
}) {
  const { pending, run, message } = useAdminAction();
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(plan.priceMonthly);
  const [active, setActive] = useState(plan.active);
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(Object.keys(LIMIT_LABELS).map((k) => [k, plan.limits[k] ?? ""])),
  );
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-center">
        <Input aria-label="Nom du plan" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          aria-label="Prix mensuel (DZD)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Actif
        </label>
      </div>
      <Button
        size="sm"
        className="w-fit"
        disabled={pending}
        onClick={() =>
          run(() => updatePlanAction({ planId: plan.id, name, priceMonthly: price, active }))
        }
      >
        Enregistrer le plan
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(LIMIT_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <label htmlFor={`${plan.id}-${key}`} className="w-48 shrink-0 text-sm">
              {label}
            </label>
            <Input
              id={`${plan.id}-${key}`}
              inputMode="decimal"
              placeholder="illimité"
              value={limits[key]}
              onChange={(e) => setLimits({ ...limits, [key]: e.target.value })}
              className="h-9"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(() =>
                  setPlanLimitAction({
                    planId: plan.id,
                    key: key as never,
                    value: limits[key]!.trim() === "" ? null : limits[key]!.trim(),
                  }),
                )
              }
            >
              OK
            </Button>
          </div>
        ))}
      </div>
      {message}
    </div>
  );
}

export function PricingForm() {
  const { pending, run, message } = useAdminAction();
  const [f, setF] = useState({
    provider: "OPENAI",
    model: "",
    input: "",
    output: "",
    cachedInput: "",
    currency: "USD",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          setPricingAction({
            provider: f.provider as "OPENAI" | "GEMINI",
            model: f.model,
            input: f.input,
            output: f.output,
            cachedInput: f.cachedInput || undefined,
            currency: f.currency,
            effectiveFrom: f.effectiveFrom,
          }),
        );
      }}
    >
      <Select aria-label="Fournisseur" value={f.provider} onChange={set("provider")}>
        <option value="OPENAI">OpenAI</option>
        <option value="GEMINI">Gemini</option>
      </Select>
      <Input
        aria-label="Modèle"
        placeholder="Modèle (identique à AI_MODEL)"
        required
        value={f.model}
        onChange={set("model")}
      />
      <Input
        aria-label="Prix entrée / million de jetons"
        placeholder="Entrée / M jetons"
        required
        inputMode="decimal"
        value={f.input}
        onChange={set("input")}
      />
      <Input
        aria-label="Prix sortie / million de jetons"
        placeholder="Sortie / M jetons"
        required
        inputMode="decimal"
        value={f.output}
        onChange={set("output")}
      />
      <Input
        aria-label="Prix entrée en cache / million de jetons"
        placeholder="Entrée en cache (optionnel)"
        inputMode="decimal"
        value={f.cachedInput}
        onChange={set("cachedInput")}
      />
      <Input aria-label="Devise" maxLength={3} value={f.currency} onChange={set("currency")} />
      <Input
        aria-label="Date d'effet"
        type="date"
        required
        value={f.effectiveFrom}
        onChange={set("effectiveFrom")}
      />
      <Button type="submit" disabled={pending}>
        Enregistrer le tarif
      </Button>
      <div className="sm:col-span-2">{message}</div>
    </form>
  );
}
