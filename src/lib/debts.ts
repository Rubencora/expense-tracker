// Pure calculation helpers for the "Balance de deudas" module.
// Mirrors the formulas of the historical Excel ("Deudas Ruben 2026.xlsx" → sheet "Balance"):
//   DEUDA TOTAL      = SUM(saldos del mes)            (USD rows converted with TRM)
//   PAGOS TOTAL      = SUM(pagos del mes)
//   Ingresos         = Sueldo + Ingresos extra
//   Presupuesto/Día  = Ingresos / días del mes
//   Ejecutado/Día    = Deuda total / días transcurridos
//   % Ejecución      = Ejecutado/Día ÷ Presupuesto/Día
//   Diferencia       = Ingresos - Deuda total
//   Consumo TC       = Σ saldos tarjetas ÷ Σ cupos tarjetas

export type DebtKind = "CREDIT_CARD" | "LOAN" | "PERSONAL" | "TAX" | "OTHER";

export interface DebtLike {
  id: string;
  name: string;
  kind: DebtKind;
  currency: string; // "COP" | "USD"
  creditLimit: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface DebtEntryLike {
  debtId: string;
  year: number;
  month: number;
  balance: number;
  payment: number;
  note?: string | null;
}

export interface DebtMonthParams {
  year: number;
  month: number;
  salary: number;
  extraIncome: number;
  trm: number | null;
  notes?: string | null;
}

export interface MonthSummary {
  year: number;
  month: number;
  trm: number;
  daysInMonth: number;
  daysElapsed: number;
  totalDebt: number;
  totalPayments: number;
  salary: number;
  extraIncome: number;
  income: number;
  budgetPerDay: number;
  spentPerDay: number;
  executionRatio: number | null;
  difference: number;
  cardBalance: number;
  cardLimit: number;
  cardUsage: number | null;
  debtDelta: number | null;
}

export interface DebtCell {
  balance: number;
  payment: number;
  balanceCop: number;
  paymentCop: number;
  note: string | null;
  exists: boolean;
}

export interface MonthColumn {
  year: number;
  month: number;
  key: string; // "YYYY-MM"
  params: DebtMonthParams;
  cells: Record<string, DebtCell>; // by debtId
  summary: MonthSummary;
}

export const DEBT_KIND_LABELS: Record<DebtKind, string> = {
  CREDIT_CARD: "Tarjeta de credito",
  LOAN: "Credito",
  PERSONAL: "Persona",
  TAX: "Impuestos",
  OTHER: "Otro",
};

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysElapsedIn(year: number, month: number, today: Date = new Date()): number {
  const total = daysInMonth(year, month);
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  if (year < ty || (year === ty && month < tm)) return total;
  if (year === ty && month === tm) return Math.max(1, Math.min(total, today.getDate()));
  return total; // future month: assume full month
}

/** Inclusive list of months from `from` to `to` in chronological order. */
export function monthRange(
  from: { year: number; month: number },
  to: { year: number; month: number }
): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = from.year;
  let m = from.month;
  const limit = 24 * 20; // hard guard
  while ((y < to.year || (y === to.year && m <= to.month)) && out.length < limit) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function toCop(amount: number, currency: string, trm: number): number {
  return currency === "USD" ? amount * trm : amount;
}

export function computeMonthSummary(args: {
  year: number;
  month: number;
  debts: DebtLike[];
  entries: DebtEntryLike[]; // entries for this month only
  params: DebtMonthParams;
  trm: number;
  previousTotalDebt?: number | null;
  today?: Date;
}): MonthSummary {
  const { year, month, debts, entries, params, trm, previousTotalDebt = null, today } = args;
  const byDebt = new Map(entries.map((e) => [e.debtId, e]));

  let totalDebt = 0;
  let totalPayments = 0;
  let cardBalance = 0;
  let cardLimit = 0;

  for (const debt of debts) {
    const entry = byDebt.get(debt.id);
    const balanceCop = entry ? toCop(entry.balance, debt.currency, trm) : 0;
    const paymentCop = entry ? toCop(entry.payment, debt.currency, trm) : 0;
    totalDebt += balanceCop;
    totalPayments += paymentCop;
    if (debt.kind === "CREDIT_CARD" && debt.isActive && debt.creditLimit && debt.creditLimit > 0) {
      cardLimit += toCop(debt.creditLimit, debt.currency, trm);
      cardBalance += balanceCop;
    }
  }

  const dim = daysInMonth(year, month);
  const elapsed = daysElapsedIn(year, month, today);
  const income = params.salary + params.extraIncome;
  const budgetPerDay = income / dim;
  const spentPerDay = totalDebt / elapsed;
  const executionRatio = budgetPerDay > 0 ? spentPerDay / budgetPerDay : null;

  return {
    year,
    month,
    trm,
    daysInMonth: dim,
    daysElapsed: elapsed,
    totalDebt,
    totalPayments,
    salary: params.salary,
    extraIncome: params.extraIncome,
    income,
    budgetPerDay,
    spentPerDay,
    executionRatio,
    difference: income - totalDebt,
    cardBalance,
    cardLimit,
    cardUsage: cardLimit > 0 ? cardBalance / cardLimit : null,
    debtDelta: previousTotalDebt === null ? null : totalDebt - previousTotalDebt,
  };
}

/**
 * Builds the full grid (one column per month) from raw DB rows.
 * `fallbackTrm` is used when a month has no explicit TRM; the most recent
 * explicit TRM from a previous month wins over the fallback.
 */
export function buildBalanceGrid(args: {
  months: { year: number; month: number }[];
  debts: DebtLike[];
  entries: DebtEntryLike[];
  monthParams: DebtMonthParams[];
  fallbackTrm: number;
  today?: Date;
}): MonthColumn[] {
  const { months, debts, entries, monthParams, fallbackTrm, today } = args;
  const paramsByKey = new Map(monthParams.map((p) => [monthKey(p.year, p.month), p]));
  const entriesByKey = new Map<string, DebtEntryLike[]>();
  for (const e of entries) {
    const k = monthKey(e.year, e.month);
    const list = entriesByKey.get(k) ?? [];
    list.push(e);
    entriesByKey.set(k, list);
  }

  // Carry forward the last explicit TRM so older months stay stable.
  const sortedParams = [...monthParams].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

  const columns: MonthColumn[] = [];
  let previousTotal: number | null = null;

  for (const { year, month } of months) {
    const key = monthKey(year, month);
    const params: DebtMonthParams = paramsByKey.get(key) ?? {
      year,
      month,
      salary: 0,
      extraIncome: 0,
      trm: null,
    };

    let trm = params.trm ?? null;
    if (trm === null) {
      const idx = year * 12 + month;
      for (let i = sortedParams.length - 1; i >= 0; i--) {
        const p = sortedParams[i];
        if (p.trm && p.year * 12 + p.month <= idx) {
          trm = p.trm;
          break;
        }
      }
    }
    const resolvedTrm = trm ?? fallbackTrm;

    const monthEntries = entriesByKey.get(key) ?? [];
    const byDebt = new Map(monthEntries.map((e) => [e.debtId, e]));
    const cells: Record<string, DebtCell> = {};
    for (const d of debts) {
      const e = byDebt.get(d.id);
      cells[d.id] = {
        balance: e?.balance ?? 0,
        payment: e?.payment ?? 0,
        balanceCop: e ? toCop(e.balance, d.currency, resolvedTrm) : 0,
        paymentCop: e ? toCop(e.payment, d.currency, resolvedTrm) : 0,
        note: e?.note ?? null,
        exists: Boolean(e),
      };
    }

    const summary = computeMonthSummary({
      year,
      month,
      debts,
      entries: monthEntries,
      params,
      trm: resolvedTrm,
      previousTotalDebt: previousTotal,
      today,
    });
    previousTotal = summary.totalDebt;

    columns.push({ year, month, key, params: { ...params, trm: params.trm ?? null }, cells, summary });
  }

  return columns;
}
