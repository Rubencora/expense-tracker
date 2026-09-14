import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLatestDebtSummary } from "@/lib/debts-summary";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysRemainingInMonth(now: Date): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate() + 1; // include today
}

export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "month";

  const now = new Date();

  // --- Current month expenses ---
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const currentMonthExpensesList = await prisma.expense.findMany({
    where: {
      userId,
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    select: { amount: true, currency: true, amountUsd: true },
  });
  const monthlyExpenses = currentMonthExpensesList.reduce((sum, e) => sum + e.amountUsd, 0);

  // --- Last month expenses ---
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

  const lastMonthAgg = await prisma.expense.aggregate({
    where: {
      userId,
      createdAt: { gte: lastMonthStart, lt: lastMonthEnd },
    },
    _sum: { amountUsd: true },
  });
  const lastMonthExpenses = lastMonthAgg._sum.amountUsd || 0;

  // --- Ingresos + deuda (modulo Deudas) ---
  // El balance parte de la deuda: usa el Sueldo/Ingresos extra y la DEUDA TOTAL
  // del mes mas reciente con datos en Deudas (no del modulo Ingresos por
  // separado), y les resta los gastos registrados en Gastos.
  const debtSummary = await getLatestDebtSummary(userId);
  const monthlyIncome = debtSummary?.incomeUsd ?? 0;
  const outstandingDebtUsd = debtSummary?.totalDebtUsd ?? 0;

  // --- Derived metrics ---
  const balance = monthlyIncome - outstandingDebtUsd - monthlyExpenses;
  const savingsRate = balance > 0 && monthlyIncome > 0 ? (balance / monthlyIncome) * 100 : 0;
  const expenseRatio = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : 0;
  const remaining = daysRemainingInMonth(now);
  const dailyAvailable = remaining > 0 ? balance / remaining : 0;
  const lastMonthRatio = monthlyIncome > 0 ? lastMonthExpenses / monthlyIncome : 0;

  // --- COP-consistent balance ---
  // Sueldo/Deuda ya vienen en COP anclados a la TRM de ese mes en Deudas.
  // Convertir el balance en USD a COP con la tasa de mercado del dia (que
  // puede diferir mucho de esa TRM) produciria un numero que no cuadra con
  // "Sueldo - Deuda - Gasto" en COP. Los gastos se suman en su monto COP
  // real (la mayoria se registran nativamente en COP, sin conversion) en
  // vez de reconstruirlos desde amountUsd con cualquier tasa; solo los
  // gastos en USD usan la TRM de Deudas como mejor aproximacion.
  const trm = debtSummary?.trm ?? 0;
  const monthlyExpensesCop = currentMonthExpensesList.reduce(
    (sum, e) => sum + (e.currency === "COP" ? e.amount : trm > 0 ? e.amountUsd * trm : 0),
    0
  );
  const balanceCop = debtSummary ? debtSummary.incomeCop - debtSummary.totalDebtCop - monthlyExpensesCop : 0;
  const dailyAvailableCop = remaining > 0 ? balanceCop / remaining : 0;

  // --- Monthly history (last 6 months) ---
  // Nota: el Sueldo/Deuda de Deudas solo se conoce para el mes mas reciente;
  // los meses pasados de este grafico siguen usando ese mismo ingreso como
  // referencia (no el ingreso historico real de cada mes).
  const monthlyHistory: { month: string; income: number; expenses: number; balance: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const histDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const histEnd = new Date(histDate.getFullYear(), histDate.getMonth() + 1, 1);
    const yearStr = histDate.getFullYear().toString();
    const monthStr = (histDate.getMonth() + 1).toString().padStart(2, "0");
    const label = `${yearStr}-${monthStr}`;

    const agg = await prisma.expense.aggregate({
      where: {
        userId,
        createdAt: { gte: histDate, lt: histEnd },
      },
      _sum: { amountUsd: true },
    });

    const histExpenses = agg._sum.amountUsd || 0;
    monthlyHistory.push({
      month: label,
      income: round2(monthlyIncome),
      expenses: round2(histExpenses),
      balance: round2(monthlyIncome - histExpenses),
    });
  }

  return NextResponse.json({
    monthlyIncome: round2(monthlyIncome),
    monthlyExpenses: round2(monthlyExpenses),
    balance: round2(balance),
    balanceCop: Math.round(balanceCop),
    savingsRate: round2(savingsRate),
    expenseRatio: round2(expenseRatio),
    dailyAvailable: round2(dailyAvailable),
    dailyAvailableCop: Math.round(dailyAvailableCop),
    lastMonthExpenses: round2(lastMonthExpenses),
    lastMonthRatio: round2(lastMonthRatio),
    monthlyHistory,
    outstandingDebt: debtSummary
      ? {
          usd: round2(debtSummary.totalDebtUsd),
          cop: Math.round(debtSummary.totalDebtCop),
          incomeUsd: round2(debtSummary.incomeUsd),
          incomeCop: Math.round(debtSummary.incomeCop),
          year: debtSummary.year,
          month: debtSummary.month,
        }
      : null,
  });
});
