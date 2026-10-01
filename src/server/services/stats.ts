import "server-only";
import { isoToDate, todayISO } from "@/lib/dates";
import { Prisma } from "@/server/db/client";
import { assertPermission, type TenantContext } from "@/server/tenant/resolve";

/**
 * Statistiques du tableau de bord, calculées en base (agrégats), jamais côté navigateur.
 * - « Facturé » = factures émises, payées en partie ou payées (ni brouillon ni annulée),
 *   par date de facture, montants TTC.
 * - « Encaissé » = paiements non annulés, par date de paiement.
 * - « Impayé » = total - payé des factures émises ou payées en partie.
 * - « En retard » = impayé dont l'échéance est strictement dépassée (heure d'Alger).
 * Tout passe par le client tenant : aucune donnée d'une autre entreprise. Montants en
 * chaînes décimales exactes.
 */
type Ctx = Pick<TenantContext, "db" | "role" | "userId" | "organizationId">;

const MONTHS_SHOWN = 12;
const SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];
const ZERO = () => new Prisma.Decimal(0);
const BILLED = ["ISSUED", "PARTIALLY_PAID", "PAID"] as const;
const OPEN = ["ISSUED", "PARTIALLY_PAID"] as const;

/** « 2026-10 » → { start: premier jour, label: « oct. 26 » }. */
function monthWindow(todayIso: string, count: number) {
  const [y, m] = todayIso.split("-").map(Number);
  const months: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    months.push({
      key: `${yy}-${String(mm).padStart(2, "0")}`,
      label: `${SHORT[mm - 1]} ${String(yy).slice(2)}`,
    });
  }
  return months;
}

export async function getDashboard(ctx: Ctx, today: string = todayISO()) {
  assertPermission(ctx, "stats:read");
  const months = monthWindow(today, MONTHS_SHOWN);
  const from = isoToDate(`${months[0].key}-01`);
  const todayDate = isoToDate(today);
  const thisMonth = months[months.length - 1].key;

  const [
    billedByDay,
    paidByDay,
    open,
    overdue,
    drafts,
    quotesSent,
    quotesAccepted,
    top,
    unpaidList,
    recent,
  ] = await Promise.all([
    ctx.db.invoice.groupBy({
      by: ["issueDate"],
      where: { status: { in: [...BILLED] }, issueDate: { gte: from, lte: todayDate } },
      _sum: { total: true },
    }),
    ctx.db.payment.groupBy({
      by: ["paymentDate"],
      where: { voidedAt: null, paymentDate: { gte: from, lte: todayDate } },
      _sum: { amount: true },
    }),
    ctx.db.invoice.aggregate({
      where: { status: { in: [...OPEN] } },
      _sum: { total: true, amountPaid: true },
      _count: { _all: true },
    }),
    ctx.db.invoice.aggregate({
      where: { status: { in: [...OPEN] }, dueDate: { lt: todayDate } },
      _sum: { total: true, amountPaid: true },
      _count: { _all: true },
    }),
    ctx.db.invoice.count({ where: { status: "DRAFT" } }),
    ctx.db.quote.count({
      where: { status: "SENT", OR: [{ expiryDate: null }, { expiryDate: { gte: todayDate } }] },
    }),
    ctx.db.quote.count({ where: { status: "ACCEPTED" } }),
    ctx.db.invoice.groupBy({
      by: ["customerId"],
      where: { status: { in: [...BILLED] }, issueDate: { gte: from, lte: todayDate } },
      _sum: { total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
    ctx.db.invoice.findMany({
      where: { status: { in: [...OPEN] }, dueDate: { lt: todayDate } },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        customer: { select: { name: true } },
      },
    }),
    ctx.db.payment.findMany({
      where: { voidedAt: null },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        method: true,
        invoice: {
          select: { id: true, invoiceNumber: true, customer: { select: { name: true } } },
        },
      },
    }),
  ]);

  const invoiced = new Map(months.map((m) => [m.key, ZERO()]));
  const collected = new Map(months.map((m) => [m.key, ZERO()]));
  for (const r of billedByDay) {
    const k = r.issueDate.toISOString().slice(0, 7);
    invoiced.set(k, (invoiced.get(k) ?? ZERO()).plus(r._sum.total ?? 0));
  }
  for (const r of paidByDay) {
    const k = r.paymentDate.toISOString().slice(0, 7);
    collected.set(k, (collected.get(k) ?? ZERO()).plus(r._sum.amount ?? 0));
  }
  const remaining = (a: {
    _sum: { total: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null };
  }) => (a._sum.total ?? ZERO()).minus(a._sum.amountPaid ?? ZERO());

  const customerNames = top.length
    ? await ctx.db.customer.findMany({
        where: { id: { in: top.map((t) => t.customerId) } },
        select: { id: true, name: true },
      })
    : [];
  const nameOf = new Map(customerNames.map((c) => [c.id, c.name]));
  const sum12 = (m: Map<string, Prisma.Decimal>) =>
    [...m.values()].reduce((a, b) => a.plus(b), ZERO());

  return {
    today,
    series: months.map((m) => ({
      month: m.key,
      label: m.label,
      invoiced: invoiced.get(m.key)!.toFixed(2),
      collected: collected.get(m.key)!.toFixed(2),
    })),
    kpis: {
      invoicedThisMonth: invoiced.get(thisMonth)!.toFixed(2),
      collectedThisMonth: collected.get(thisMonth)!.toFixed(2),
      invoiced12: sum12(invoiced).toFixed(2),
      collected12: sum12(collected).toFixed(2),
      outstanding: remaining(open).toFixed(2),
      outstandingCount: open._count._all,
      overdue: remaining(overdue).toFixed(2),
      overdueCount: overdue._count._all,
      draftInvoices: drafts,
      quotesAwaitingAnswer: quotesSent,
      quotesToInvoice: quotesAccepted,
    },
    topCustomers: top.map((t) => ({
      customerId: t.customerId,
      name: nameOf.get(t.customerId) ?? "—",
      total: (t._sum.total ?? ZERO()).toFixed(2),
    })),
    overdueInvoices: unpaidList.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      dueDate: i.dueDate,
      customer: i.customer.name,
      remaining: i.total.minus(i.amountPaid).toFixed(2),
    })),
    recentPayments: recent.map((p) => ({
      id: p.id,
      amount: p.amount.toFixed(2),
      paymentDate: p.paymentDate,
      method: p.method,
      invoice: p.invoice,
    })),
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
