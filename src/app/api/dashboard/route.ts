import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSpaceMember } from "@/lib/space-auth";
import { fetchExchangeRate } from "@/lib/currency";

export const GET = authMiddleware(async (req: NextRequest, { userId }) => {
  const { searchParams } = new URL(req.url);
  const spaceId = searchParams.get("spaceId");
  const period = searchParams.get("period") || "month";
  const categoryId = searchParams.get("categoryId");
  const displayCurrency = searchParams.get("currency") === "COP" ? "COP" : "USD";
  // Explicit dateFrom/dateTo (e.g. from Gastos' month navigator or custom range)
  // override the period-based shorthand, so this endpoint can power any
  // arbitrarily selected window, not just today/week/month/all.
  const dateFromParam = searchParams.get("dateFrom");
  const dateToParam = searchParams.get("dateTo");

  // Calculate date range
  const now = new Date();
  let dateFrom: Date;
  let dateTo: Date | null = null;

  if (dateFromParam) {
    const parsed = new Date(dateFromParam);
    dateFrom = Number.isNaN(parsed.getTime()) ? new Date(now.getFullYear(), now.getMonth(), 1) : parsed;
    if (dateToParam) {
      const parsedTo = new Date(dateToParam);
      if (!Number.isNaN(parsedTo.getTime())) {
        dateTo = parsedTo;
      }
    }
  } else {
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
  }
  const isUnbounded = !dateFromParam && period === "all";

  // Build where clause
  const where: Record<string, unknown> = {
    createdAt: dateTo ? { gte: dateFrom, lte: dateTo } : { gte: dateFrom },
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

  const isSharedSpace = spaceId && spaceId !== "personal" && spaceId !== "all";

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, emoji: true, color: true } },
      ...(isSharedSpace ? { user: { select: { id: true, name: true } } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  // Get exchange rate for currency conversion
  const copRate = displayCurrency === "COP" ? await fetchExchangeRate() : 1;
  const toDisplay = (usd: number) => displayCurrency === "COP" ? Math.round(usd * copRate) : Math.round(usd * 100) / 100;

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

  // User distribution (shared spaces only)
  let userDistribution: { id: string; name: string; total: number; count: number }[] = [];
  if (isSharedSpace) {
    const userMap = new Map<string, { id: string; name: string; total: number; count: number }>();
    for (const e of expenses) {
      const u = (e as unknown as { user: { id: string; name: string } }).user;
      if (!u) continue;
      const existing = userMap.get(u.id);
      if (existing) {
        existing.total += e.amountUsd;
        existing.count += 1;
      } else {
        userMap.set(u.id, { id: u.id, name: u.name, total: e.amountUsd, count: 1 });
      }
    }
    userDistribution = Array.from(userMap.values())
      .map((u) => ({ ...u, total: Math.round(u.total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
  }

  // Daily trend - fill all days from dateFrom to the end of the window (or
  // today, capped, so a bounded past range like a custom month doesn't
  // spill the trend all the way to the present).
  const dailyMap = new Map<string, number>();
  for (const e of expenses) {
    const day = e.createdAt.toISOString().split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) || 0) + e.amountUsd);
  }
  const dailyTrend: { date: string; total: number }[] = [];
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const trendEndRaw = dateTo ?? todayDate;
  const trendEnd = trendEndRaw > todayDate ? todayDate : trendEndRaw;
  const spanDays = Math.round((trendEnd.getTime() - dateFrom.getTime()) / 86400000);
  if (!isUnbounded && spanDays >= 0 && spanDays <= 366) {
    const cursor = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate());
    const endDay = new Date(trendEnd.getFullYear(), trendEnd.getMonth(), trendEnd.getDate());
    while (cursor <= endDay) {
      const key = cursor.toISOString().split("T")[0];
      dailyTrend.push({ date: key, total: Math.round((dailyMap.get(key) || 0) * 100) / 100 });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    // Unbounded ("all") or a very long span: only show days with expenses.
    dailyTrend.push(
      ...Array.from(dailyMap.entries())
        .map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  // --- Previous-period comparison ("balance"/trend vs the prior equivalent
  // window, e.g. this month vs last month, or this range vs the same-length
  // range right before it). Skipped for the unbounded "all time" view.
  let previousPeriod: { total: number; count: number; changePercent: number | null } | null = null;
  if (!isUnbounded) {
    const windowEnd = dateTo ?? now;
    const spanMs = windowEnd.getTime() - dateFrom.getTime();
    if (spanMs > 0) {
      const prevTo = new Date(dateFrom.getTime() - 1);
      const prevFrom = new Date(dateFrom.getTime() - spanMs);
      const prevAgg = await prisma.expense.aggregate({
        where: { ...where, createdAt: { gte: prevFrom, lte: prevTo } },
        _sum: { amountUsd: true },
        _count: true,
      });
      const prevTotalUsd = prevAgg._sum.amountUsd ?? 0;
      const changePercent = prevTotalUsd > 0 ? ((totalUsd - prevTotalUsd) / prevTotalUsd) * 100 : null;
      previousPeriod = {
        total: toDisplay(prevTotalUsd),
        count: prevAgg._count,
        changePercent: changePercent === null ? null : Math.round(changePercent * 10) / 10,
      };
    }
  }

  // Convert all amounts to display currency
  const convertedCategoryDistribution = categoryDistribution.map((c) => ({
    ...c,
    total: toDisplay(c.total),
  }));
  const convertedDailyTrend = dailyTrend.map((d) => ({
    ...d,
    total: toDisplay(d.total),
  }));
  const convertedUserDistribution = userDistribution.map((u) => ({
    ...u,
    total: toDisplay(u.total),
  }));
  const convertedTopCategory = topCategory
    ? { ...topCategory, total: toDisplay(topCategory.total) }
    : null;

  // Always return the COP rate so frontend can convert other amounts (cashflow etc.)
  const rateForClient = displayCurrency === "COP" ? copRate : await fetchExchangeRate();

  return NextResponse.json({
    total: toDisplay(totalUsd),
    currency: displayCurrency,
    copRate: rateForClient,
    count,
    avgDaily: toDisplay(avgDaily),
    daysWithExpenses,
    biggestExpense: biggest
      ? { merchant: biggest.merchant, amount: toDisplay(biggest.amountUsd) }
      : null,
    topCategory: convertedTopCategory,
    categoryDistribution: convertedCategoryDistribution,
    dailyTrend: convertedDailyTrend,
    previousPeriod,
    ...(isSharedSpace ? { userDistribution: convertedUserDistribution } : {}),
    // Keep legacy fields for backwards compat
    totalUsd: Math.round(totalUsd * 100) / 100,
  });
});
