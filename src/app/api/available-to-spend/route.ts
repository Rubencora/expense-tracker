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
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // 1. Ingresos y deuda (modulo Deudas): Sueldo/Ingresos extra y DEUDA TOTAL
  // del mes mas reciente con datos en Deudas, en vez del modulo Ingresos.
  const debtSummary = await getLatestDebtSummary(userId);
  const monthlyIncome = debtSummary?.incomeUsd ?? 0;
  const outstandingDebtUsd = debtSummary?.totalDebtUsd ?? 0;

  // 2. Get total expenses for the current month
  const expensesAgg = await prisma.expense.aggregate({
    where: {
      userId,
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amountUsd: true },
  });
  const monthlyExpenses = expensesAgg._sum.amountUsd || 0;

  // 3. Get total savings goal contributions for the current month
  const contributions = await prisma.savingsContribution.findMany({
    where: {
      goal: { userId },
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    select: { amountUsd: true },
  });
  const monthlySavings = contributions.reduce((sum, c) => sum + c.amountUsd, 0);

  // 4. Get all active (not completed) savings goals
  const activeGoals = await prisma.savingsGoal.findMany({
    where: { userId, isCompleted: false },
    select: {
      id: true,
      name: true,
      icon: true,
      targetAmountUsd: true,
      currentAmountUsd: true,
      isCompleted: true,
      deadline: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // 5. Calculate derived metrics
  const totalSavingsCommitted = activeGoals.reduce(
    (sum, g) => sum + (g.targetAmountUsd - g.currentAmountUsd),
    0
  );

  const availableToSpend = monthlyIncome - outstandingDebtUsd - monthlyExpenses - monthlySavings;

  const daysRemaining = daysRemainingInMonth(now);
  const dailyBudget = availableToSpend > 0 ? availableToSpend / daysRemaining : 0;

  // 6. COP-consistent version. Sueldo/Deuda vienen en COP anclados a la TRM
  // del mes en Deudas; convertir availableToSpend (USD) a COP con la tasa de
  // mercado del dia desalinearia el numero de "Sueldo - Deuda - Gasto -
  // Ahorro" en COP. Gastos y ahorros se convierten con esa misma TRM.
  const trm = debtSummary?.trm ?? 0;
  const monthlyExpensesCop = trm > 0 ? monthlyExpenses * trm : 0;
  const monthlySavingsCop = trm > 0 ? monthlySavings * trm : 0;
  const availableToSpendCop = debtSummary
    ? debtSummary.incomeCop - debtSummary.totalDebtCop - monthlyExpensesCop - monthlySavingsCop
    : 0;
  const dailyBudgetCop = availableToSpendCop > 0 ? availableToSpendCop / daysRemaining : 0;

  // 7. Return all values
  return NextResponse.json({
    monthlyIncome: round2(monthlyIncome),
    monthlyExpenses: round2(monthlyExpenses),
    monthlySavings: round2(monthlySavings),
    totalSavingsCommitted: round2(totalSavingsCommitted),
    availableToSpend: round2(availableToSpend),
    availableToSpendCop: Math.round(availableToSpendCop),
    daysRemaining,
    dailyBudget: round2(dailyBudget),
    dailyBudgetCop: Math.round(dailyBudgetCop),
    activeGoals,
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
