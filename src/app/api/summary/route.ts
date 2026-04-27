import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchExchangeRate } from "@/lib/currency";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Token requerido. Usa ?token=TU_API_TOKEN" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { apiToken: token },
    select: { id: true, name: true, email: true, defaultCurrency: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "API token invalido" },
      { status: 401 }
    );
  }

  const userId = user.id;

  // Query params
  const period = searchParams.get("period") || "month";
  const categoryId = searchParams.get("categoryId");
  const displayCurrency =
    searchParams.get("currency") === "USD" ? "USD" : (user.defaultCurrency || "COP");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  // Date range
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

  // Build where clause (personal expenses only)
  const where: Record<string, unknown> = {
    userId,
    spaceId: null,
    createdAt: { gte: dateFrom },
  };
  if (categoryId) where.categoryId = categoryId;

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: { select: { name: true, emoji: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Currency conversion
  const copRate =
    displayCurrency === "COP" ? await fetchExchangeRate() : 1;
  const toDisplay = (usd: number) =>
    displayCurrency === "COP"
      ? Math.round(usd * copRate)
      : Math.round(usd * 100) / 100;

  // Summary calculations
  const totalUsd = expenses.reduce((sum, e) => sum + e.amountUsd, 0);
  const count = expenses.length;

  // Category distribution
  const categoryMap = new Map<
    string,
    { name: string; emoji: string; total: number; count: number }
  >();
  for (const e of expenses) {
    const key = e.category.name;
    const existing = categoryMap.get(key);
    if (existing) {
      existing.total += e.amountUsd;
      existing.count += 1;
    } else {
      categoryMap.set(key, {
        name: e.category.name,
        emoji: e.category.emoji,
        total: e.amountUsd,
        count: 1,
      });
    }
  }
  const categories = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total)
    .map((c) => ({ ...c, total: toDisplay(c.total) }));

  return NextResponse.json({
    user: { name: user.name, email: user.email },
    period,
    currency: displayCurrency,
    summary: {
      total: toDisplay(totalUsd),
      totalUsd: Math.round(totalUsd * 100) / 100,
      count,
      categories,
    },
    expenses: expenses.map((e) => ({
      id: e.id,
      merchant: e.merchant,
      amount: toDisplay(e.amountUsd),
      originalAmount: e.amount,
      originalCurrency: e.currency,
      category: `${e.category.emoji} ${e.category.name}`,
      source: e.source,
      date: e.createdAt.toISOString(),
    })),
  });
}
