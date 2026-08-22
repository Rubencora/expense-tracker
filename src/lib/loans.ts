// Pure calculation helpers for the "Créditos" module (French amortization).
// Mirrors the Excel "Estado Credito" sheets:
//   Cuota        = PMT(i, n, P)            = P / (((1+i)^n - 1) / (i (1+i)^n))
//   Interés_k    = -IPMT(i, k, n, P)        (interest part of period k)
//   Amortización = -PPMT(i, k, n, P)        (principal part of period k)
//   Saldo teórico_k = Saldo_{k-1} - Amortización_k
//   EA           = (1+i)^12 - 1
// Real tracking depends on the loan's mode:
//   SCHEDULE: saldo real_k = override_k ?? (saldo real_{k-1} - amortización_k - abono extra_k)
//             (hoja "Credito Carro": columna Extra + saldo reportado)
//   PAYMENTS: saldo real_k = override_k ?? (saldo real_{k-1} - pago_k)
//             (hoja "Credito HoyTrabajas": columna "A Pagar" = pagos reales, saldo = P - Σ pagos)

export type LoanTrackingMode = "SCHEDULE" | "PAYMENTS";

export interface LoanLike {
  id: string;
  name: string;
  principal: number;
  monthlyRate: number; // e.g. 0.011 = 1.1 % monthly
  termMonths: number;
  startYear: number;
  startMonth: number; // 1-12, month of period 1
  trackingMode: LoanTrackingMode;
}

export interface LoanPeriodInput {
  period: number;
  payment: number | null;
  extraPayment: number | null;
  balanceOverride: number | null;
  note?: string | null;
}

export interface ScheduleRow {
  period: number;
  year: number;
  month: number;
  key: string; // YYYY-MM
  isPast: boolean;
  isCurrent: boolean;
  cuota: number;
  interest: number;
  amortization: number;
  theoreticalBalance: number;
  // user inputs
  payment: number | null;
  extraPayment: number | null;
  balanceOverride: number | null;
  note: string | null;
  // derived
  realPaid: number; // what counts as paid this period
  realBalance: number;
  isPaidOff: boolean;
}

export interface LoanSummary {
  cuota: number;
  effectiveAnnualRate: number;
  totalInterest: number;
  totalAmortization: number;
  totalCost: number; // interest + amortization (theoretical)
  interestToDate: number; // theoretical interest of the periods elapsed so far
  projectedInterest: number; // theoretical interest until the projected payoff (or the end of the term)
  paidToDate: number; // principal amortized so far (capital - saldo real)
  cashPaidToDate: number; // cash disbursed so far (cuotas + abonos, interest included)
  paidPercent: number;
  realBalance: number; // balance as of the current period (or last period if finished)
  realBalancePercent: number;
  theoreticalBalanceNow: number;
  currentPeriod: number | null; // null if loan has not started yet
  periodsElapsed: number;
  periodsRemaining: number | null; // periods until the projected real balance hits 0
  payoffKey: string | null; // YYYY-MM of the projected payoff (null if not reached within the term)
  lastPaymentKey: string | null;
  endKey: string; // YYYY-MM of the last scheduled period
}

export function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonthsTo(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Constant payment of a French-amortized loan. */
export function pmt(rate: number, n: number, principal: number): number {
  if (n <= 0) return 0;
  if (rate === 0) return principal / n;
  const f = Math.pow(1 + rate, n);
  return principal / ((f - 1) / (rate * f));
}

/** Theoretical outstanding balance after `k` payments. */
export function balanceAfter(rate: number, n: number, principal: number, k: number): number {
  if (k <= 0) return principal;
  if (k >= n) return 0;
  if (rate === 0) return principal * (1 - k / n);
  const f = Math.pow(1 + rate, k);
  const payment = pmt(rate, n, principal);
  return principal * f - payment * ((f - 1) / rate);
}

/** Interest part of period k (1-based) — equals Excel's -IPMT. */
export function ipmt(rate: number, k: number, n: number, principal: number): number {
  return balanceAfter(rate, n, principal, k - 1) * rate;
}

/** Principal part of period k (1-based) — equals Excel's -PPMT. */
export function ppmt(rate: number, k: number, n: number, principal: number): number {
  return pmt(rate, n, principal) - ipmt(rate, k, n, principal);
}

export function effectiveAnnualRate(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}

function periodIndexFor(loan: LoanLike, year: number, month: number): number {
  return (year * 12 + month) - (loan.startYear * 12 + loan.startMonth) + 1;
}

export function buildSchedule(
  loan: LoanLike,
  inputs: LoanPeriodInput[],
  today: Date = new Date()
): ScheduleRow[] {
  const byPeriod = new Map(inputs.map((p) => [p.period, p]));
  const n = loan.termMonths;
  const cuota = pmt(loan.monthlyRate, n, loan.principal);
  const currentPeriod = periodIndexFor(loan, today.getFullYear(), today.getMonth() + 1);

  const rows: ScheduleRow[] = [];
  let theoretical = loan.principal;
  let real = loan.principal;
  let paidOff = false;

  for (let k = 1; k <= n; k++) {
    const { year, month } = addMonthsTo(loan.startYear, loan.startMonth, k - 1);
    const input = byPeriod.get(k);
    const interest = ipmt(loan.monthlyRate, k, n, loan.principal);
    const amortization = ppmt(loan.monthlyRate, k, n, loan.principal);
    theoretical = Math.max(0, theoretical - amortization);

    const payment = input?.payment ?? null;
    const extra = input?.extraPayment ?? null;
    const override = input?.balanceOverride ?? null;
    const isPast = k < currentPeriod;
    const isCurrent = k === currentPeriod;

    let realPaid = 0;
    let nextReal = real;
    if (!paidOff) {
      if (loan.trackingMode === "PAYMENTS") {
        realPaid = payment ?? 0;
        nextReal = real - realPaid;
      } else {
        // SCHEDULE: every period pays the scheduled cuota (projection continues
        // into the future, like the Excel table) plus any extra principal payment.
        // A registered `payment` only overrides what counts as paid that month.
        realPaid = (payment ?? cuota) + (extra ?? 0);
        nextReal = real - amortization - (extra ?? 0);
      }
      if (override !== null) nextReal = override;
      nextReal = Math.max(0, nextReal);
      if (nextReal <= 0.5) {
        nextReal = 0;
        paidOff = true;
      }
    }
    real = nextReal;

    rows.push({
      period: k,
      year,
      month,
      key: monthKeyOf(year, month),
      isPast,
      isCurrent,
      cuota,
      interest,
      amortization,
      theoreticalBalance: theoretical,
      payment,
      extraPayment: extra,
      balanceOverride: override,
      note: input?.note ?? null,
      realPaid,
      realBalance: real,
      isPaidOff: paidOff,
    });
  }
  return rows;
}

export function summarize(loan: LoanLike, rows: ScheduleRow[], today: Date = new Date()): LoanSummary {
  const n = loan.termMonths;
  const cuota = pmt(loan.monthlyRate, n, loan.principal);
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalAmortization = rows.reduce((s, r) => s + r.amortization, 0);
  const currentIdx = periodIndexFor(loan, today.getFullYear(), today.getMonth() + 1);
  const currentPeriod = currentIdx < 1 ? null : Math.min(currentIdx, n);
  const periodsElapsed = currentIdx < 1 ? 0 : Math.min(currentIdx, n);

  const nowRow = currentPeriod ? rows[currentPeriod - 1] : null;
  const realBalance = currentPeriod === null ? loan.principal : nowRow ? nowRow.realBalance : 0;

  // "Pagado hasta el momento" = principal amortized so far (capital - saldo real),
  // which is what the Excel's "Pago hasta el momento" measures. Cash actually
  // disbursed (cuotas + abonos, interest included) is reported separately.
  const paidToDate = Math.max(0, loan.principal - realBalance);
  const cashPaidToDate = rows
    .filter((r) => r.period <= (currentPeriod ?? 0))
    .reduce((s, r) => s + r.realPaid, 0);
  const theoreticalBalanceNow = currentPeriod === null ? loan.principal : balanceAfter(loan.monthlyRate, n, loan.principal, currentPeriod);

  const payoffRow = rows.find((r) => r.isPaidOff);
  const periodsRemaining = payoffRow
    ? Math.max(0, payoffRow.period - (currentPeriod ?? 0))
    : null;

  const lastPaid = [...rows].reverse().find((r) => r.realPaid > 0 && r.period <= (currentPeriod ?? 0));
  const last = rows[rows.length - 1];
  const interestToDate = rows
    .filter((r) => r.period <= (currentPeriod ?? 0))
    .reduce((s, r) => s + r.interest, 0);
  const projectedInterest = rows
    .filter((r) => r.period <= (payoffRow ? payoffRow.period : n))
    .reduce((s, r) => s + r.interest, 0);

  return {
    cuota,
    effectiveAnnualRate: effectiveAnnualRate(loan.monthlyRate),
    totalInterest,
    totalAmortization,
    totalCost: totalInterest + totalAmortization,
    interestToDate,
    projectedInterest,
    paidToDate,
    cashPaidToDate,
    paidPercent: loan.principal > 0 ? paidToDate / loan.principal : 0,
    realBalance,
    realBalancePercent: loan.principal > 0 ? realBalance / loan.principal : 0,
    theoreticalBalanceNow,
    currentPeriod,
    periodsElapsed,
    periodsRemaining,
    payoffKey: payoffRow ? payoffRow.key : null,
    lastPaymentKey: lastPaid ? lastPaid.key : null,
    endKey: last ? last.key : monthKeyOf(loan.startYear, loan.startMonth),
  };
}
