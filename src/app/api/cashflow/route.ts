import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IncomeFrequency } from "@/generated/prisma/client";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthlyAmount(amountUsd: number, frequency: IncomeFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return amountUsd;
    case "WEEKLY":
      return (amountUsd * 52) / 12;
    case "BIWEEKLY":
      return (amountUsd * 26) / 12;
    case "YEARLY":
      return amountUsd / 12;
    case "ONCE":
      return 0;
    default:
      return 0;
  }
}

function daysRemainingInMonth(now: Date): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate() + 1; // include today
}

export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "month";

  const now = new Date();

  // --- Active incomes ---
  const incomes = await prisma.income.findMany({
    where: { userId, isActive: true },
  });

  const monthlyIncome = incomes.reduce(
    (sum, inc) => sum + monthlyAmount(inc.amountUsd, inc.frequency as IncomeFrequency),
    0
  );

  // --- Current month expenses ---
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const currentMonthExpenses = await prisma.expense.aggregate({
    where: {
      userId,
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    _sum: { amountUsd: true },
  });
  const monthlyExpenses = currentMonthExpenses._sum.amountUsd || 0;

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

  // --- Derived metrics ---
  const balance = monthlyIncome - monthlyExpenses;
  const savingsRate = balance > 0 ? (balance / monthlyIncome) * 100 : 0;
  const expenseRatio = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : 0;
  const remaining = daysRemainingInMonth(now);
  const dailyAvailable = remaining > 0 ? (monthlyIncome - monthlyExpenses) / remaining : 0;
  const lastMonthRatio = monthlyIncome > 0 ? lastMonthExpenses / monthlyIncome : 0;

  // --- Monthly history (last 6 months) ---
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
    savingsRate: round2(savingsRate),
    expenseRatio: round2(expenseRatio),
    dailyAvailable: round2(dailyAvailable),
    lastMonthExpenses: round2(lastMonthExpenses),
    lastMonthRatio: round2(lastMonthRatio),
    monthlyHistory,
  });
});
