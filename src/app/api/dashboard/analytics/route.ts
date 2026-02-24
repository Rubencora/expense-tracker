import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // Current month expenses
  const currentMonthExpenses = await prisma.expense.findMany({
    where: { userId, createdAt: { gte: startOfMonth } },
    include: { category: { select: { id: true, name: true, emoji: true, color: true } } },
  });

  // Last month expenses
  const lastMonthExpenses = await prisma.expense.findMany({
    where: {
      userId,
      createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
    },
    include: { category: { select: { id: true, name: true, emoji: true, color: true } } },
  });

  // Monthly comparison by category
  const currentByCategory = new Map<string, { name: string; emoji: string; color: string; total: number }>();
  const lastByCategory = new Map<string, { name: string; emoji: string; color: string; total: number }>();

  for (const e of currentMonthExpenses) {
    const existing = currentByCategory.get(e.category.id);
    if (existing) {
      existing.total += e.amountUsd;
    } else {
      currentByCategory.set(e.category.id, {
        name: e.category.name,
        emoji: e.category.emoji,
        color: e.category.color,
        total: e.amountUsd,
      });
    }
  }

  for (const e of lastMonthExpenses) {
    const existing = lastByCategory.get(e.category.id);
    if (existing) {
      existing.total += e.amountUsd;
    } else {
      lastByCategory.set(e.category.id, {
        name: e.category.name,
        emoji: e.category.emoji,
        color: e.category.color,
        total: e.amountUsd,
      });
    }
  }

  const allCategoryIds = new Set([...currentByCategory.keys(), ...lastByCategory.keys()]);
  const monthComparison = Array.from(allCategoryIds).map((id) => {
    const current = currentByCategory.get(id);
    const last = lastByCategory.get(id);
    return {
      name: current?.name || last?.name || "",
      emoji: current?.emoji || last?.emoji || "",
      color: current?.color || last?.color || "",
      currentMonth: Math.round((current?.total || 0) * 100) / 100,
      lastMonth: Math.round((last?.total || 0) * 100) / 100,
    };
  }).sort((a, b) => b.currentMonth - a.currentMonth);

  // Monthly projection
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const totalCurrentMonth = currentMonthExpenses.reduce((s, e) => s + e.amountUsd, 0);
  const avgDailyThisMonth = dayOfMonth > 0 ? totalCurrentMonth / dayOfMonth : 0;
  const monthlyProjection = Math.round(avgDailyThisMonth * daysInMonth * 100) / 100;

  // Top 5 merchants
  const merchantMap = new Map<string, { total: number; count: number }>();
  for (const e of currentMonthExpenses) {
    const key = e.merchant.toLowerCase();
    const existing = merchantMap.get(key);
    if (existing) {
      existing.total += e.amountUsd;
      existing.count += 1;
    } else {
      merchantMap.set(key, { total: e.amountUsd, count: 1 });
    }
  }
  const topMerchants = Array.from(merchantMap.entries())
    .map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      total: Math.round(data.total * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Weekly trend (last 8 weeks)
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const recentExpenses = await prisma.expense.findMany({
    where: { userId, createdAt: { gte: eightWeeksAgo } },
    select: { amountUsd: true, createdAt: true },
  });

  const weeklyMap = new Map<string, number>();
  for (const e of recentExpenses) {
    const date = e.createdAt;
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split("T")[0];
    weeklyMap.set(key, (weeklyMap.get(key) || 0) + e.amountUsd);
  }

  const weeklyTrend = Array.from(weeklyMap.entries())
    .map(([week, total]) => ({
      week,
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // Budgets progress
  const budgets = await prisma.budget.findMany({
    where: { userId },
    include: { category: { select: { id: true, name: true, emoji: true, color: true } } },
  });

  const budgetProgress = budgets.map((b) => {
    const spent = currentByCategory.get(b.category.id)?.total || 0;
    const percent = b.monthlyLimitUsd > 0 ? (spent / b.monthlyLimitUsd) * 100 : 0;
    return {
      categoryId: b.category.id,
      categoryName: b.category.name,
      categoryEmoji: b.category.emoji,
      categoryColor: b.category.color,
      limit: b.monthlyLimitUsd,
      spent: Math.round(spent * 100) / 100,
      percent: Math.round(percent),
    };
  });

  return NextResponse.json({
    monthComparison,
    monthlyProjection,
    topMerchants,
    weeklyTrend,
    budgetProgress,
  });
});
