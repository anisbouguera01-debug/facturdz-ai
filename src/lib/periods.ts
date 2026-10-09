import { addDays, dateToISO, isoDateSchema, isoToDate, todayISO } from "./dates";

/**
 * Périodes de filtrage (sur la date d'émission, une date calendaire).
 * Tout est calculé à partir de « aujourd'hui » dans le fuseau de l'entreprise
 * (Africa/Algiers), jamais à partir de l'heure du serveur ou du navigateur.
 * Les bornes sont inclusives. La semaine commence le dimanche (semaine de travail
 * algérienne : dimanche à jeudi, week-end vendredi et samedi).
 */
export const PERIOD_PRESETS = ["today", "week", "month", "last-month", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Aujourd'hui",
  week: "Cette semaine",
  month: "Ce mois",
  "last-month": "Mois précédent",
  custom: "Période personnalisée",
};

export type ResolvedPeriod = {
  preset?: PeriodPreset;
  /** AAAA-MM-JJ, inclus. */
  from?: string;
  /** AAAA-MM-JJ, inclus. */
  to?: string;
  /** Message affichable quand la saisie est invalide (le filtre n'est alors pas appliqué). */
  error?: string;
};

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function monthEnd(iso: string): string {
  const d = isoToDate(monthStart(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return dateToISO(d);
}

function validDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const r = isoDateSchema.safeParse(v);
  return r.success ? r.data : undefined;
}

export function resolvePeriod(
  input: { period?: string; from?: string; to?: string },
  today: string = todayISO(),
): ResolvedPeriod {
  const preset = (PERIOD_PRESETS as readonly string[]).includes(input.period ?? "")
    ? (input.period as PeriodPreset)
    : undefined;

  // Des dates saisies priment sur un préréglage : c'est une période personnalisée.
  if (input.from || input.to) {
    return preset === "custom"
      ? resolveCustom(input, preset)
      : resolvePeriod({ ...input, period: "custom" }, today);
  }
  if (!preset) return {};

  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "week": {
      const dow = isoToDate(today).getUTCDay(); // 0 = dimanche
      const from = addDays(today, -dow);
      return { preset, from, to: addDays(from, 6) };
    }
    case "month":
      return { preset, from: monthStart(today), to: monthEnd(today) };
    case "last-month": {
      const lastDay = addDays(monthStart(today), -1);
      return { preset, from: monthStart(lastDay), to: lastDay };
    }
    case "custom":
      return resolveCustom(input, preset);
  }
}

function resolveCustom(
  input: { from?: string; to?: string },
  preset: PeriodPreset,
): ResolvedPeriod {
  const from = validDate(input.from);
  const to = validDate(input.to);
  if ((input.from && !from) || (input.to && !to)) {
    return { preset, error: "Date invalide : le filtre de période n'est pas appliqué." };
  }
  if (from && to && from > to) {
    return {
      preset,
      error: "La date de début doit précéder la date de fin : le filtre n'est pas appliqué.",
    };
  }
  return { preset, from, to };
}
