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
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // 1. Get all active incomes and calculate total monthly income in USD
  const incomes = await prisma.income.findMany({
    where: { userId, isActive: true },
  });

  const monthlyIncome = incomes.reduce(
    (sum, inc) => sum + monthlyAmount(inc.amountUsd, inc.frequency as IncomeFrequency),
    0
  );

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

  const availableToSpend = monthlyIncome - monthlyExpenses - monthlySavings;

  const daysRemaining = daysRemainingInMonth(now);
  const dailyBudget = availableToSpend > 0 ? availableToSpend / daysRemaining : 0;

  // 6. Return all values
  return NextResponse.json({
    monthlyIncome: round2(monthlyIncome),
    monthlyExpenses: round2(monthlyExpenses),
    monthlySavings: round2(monthlySavings),
    totalSavingsCommitted: round2(totalSavingsCommitted),
    availableToSpend: round2(availableToSpend),
    daysRemaining,
    dailyBudget: round2(dailyBudget),
    activeGoals,
  });
});
