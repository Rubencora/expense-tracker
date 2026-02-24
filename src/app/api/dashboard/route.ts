import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSpaceMember } from "@/lib/space-auth";

export const GET = authMiddleware(async (req: NextRequest, { userId }) => {
  const { searchParams } = new URL(req.url);
  const spaceId = searchParams.get("spaceId");
  const period = searchParams.get("period") || "month";
  const categoryId = searchParams.get("categoryId");

  // Calculate date range
  const now = new Date();
  let dateFrom: Date;
  switch (period) {
    case "today":
      dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 7);
      break;
    case "all":
      dateFrom = new Date(0);
      break;
    case "month":
    default:
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  // Build where clause
  const where: Record<string, unknown> = {
    createdAt: { gte: dateFrom },
  };

  if (spaceId && spaceId !== "personal" && spaceId !== "all") {
    // Shared space: verify membership, show ALL members' expenses
    const isMember = await isSpaceMember(spaceId, userId);
    if (!isMember) {
      return NextResponse.json({ error: "No eres miembro de este espacio" }, { status: 403 });
    }
    where.spaceId = spaceId;
  } else if (spaceId === "personal") {
    where.userId = userId;
    where.spaceId = null;
  } else {
    // No spaceId or "all": only user's own expenses
    where.userId = userId;
  }

  if (categoryId) where.categoryId = categoryId;

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, emoji: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Calculations
  const totalUsd = expenses.reduce((sum, e) => sum + e.amountUsd, 0);
  const count = expenses.length;

  // Days with expenses
  const uniqueDays = new Set(
    expenses.map((e) => e.createdAt.toISOString().split("T")[0])
  );
  const daysWithExpenses = uniqueDays.size;
  const avgDaily = daysWithExpenses > 0 ? totalUsd / daysWithExpenses : 0;

  // Biggest expense
  const biggest = expenses.reduce(
    (max, e) => (e.amountUsd > (max?.amountUsd || 0) ? e : max),
    null as (typeof expenses)[0] | null
  );

  // Category distribution
  const categoryMap = new Map<
    string,
    { id: string; name: string; emoji: string; color: string; total: number; count: number }
  >();
  for (const e of expenses) {
    const existing = categoryMap.get(e.category.id);
    if (existing) {
      existing.total += e.amountUsd;
      existing.count += 1;
    } else {
      categoryMap.set(e.category.id, {
        id: e.category.id,
        name: e.category.name,
        emoji: e.category.emoji,
        color: e.category.color,
        total: e.amountUsd,
        count: 1,
      });
    }
  }
  const categoryDistribution = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total);

  const topCategory = categoryDistribution[0] || null;

  // Daily trend
  const dailyMap = new Map<string, number>();
  for (const e of expenses) {
    const day = e.createdAt.toISOString().split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) || 0) + e.amountUsd);
  }
  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    totalUsd: Math.round(totalUsd * 100) / 100,
    count,
    avgDaily: Math.round(avgDaily * 100) / 100,
    daysWithExpenses,
    biggestExpense: biggest
      ? { merchant: biggest.merchant, amountUsd: biggest.amountUsd }
      : null,
    topCategory,
    categoryDistribution,
    dailyTrend,
  });
});
