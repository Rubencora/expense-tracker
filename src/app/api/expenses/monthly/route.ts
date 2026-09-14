import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSpaceMember } from "@/lib/space-auth";
import { fetchExchangeRate } from "@/lib/currency";

const MAX_MONTHS = 36;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * GET /api/expenses/monthly?spaceId=&categoryId=&months=12
 * Monthly expense totals for the "Gastos mes a mes" chart and the month
 * navigator — lets the UI show which months actually have data instead of
 * a single unlabeled "this month" filter.
 */
export const GET = authMiddleware(async (req: NextRequest, { userId }) => {
  const { searchParams } = new URL(req.url);
  const spaceId = searchParams.get("spaceId");
  const categoryId = searchParams.get("categoryId");
  const months = Math.min(MAX_MONTHS, Math.max(1, Number(searchParams.get("months")) || 12));

  const where: Record<string, unknown> = {};
  if (spaceId && spaceId !== "personal" && spaceId !== "all") {
    const isMember = await isSpaceMember(spaceId, userId);
    if (!isMember) {
      return NextResponse.json({ error: "No eres miembro de este espacio" }, { status: 403 });
    }
    where.spaceId = spaceId;
  } else if (spaceId === "personal") {
    where.userId = userId;
    where.spaceId = null;
  } else {
    where.userId = userId;
  }
  if (categoryId) where.categoryId = categoryId;

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const [rows, earliestExpense, copRate] = await Promise.all([
    prisma.expense.findMany({
      where: { ...where, createdAt: { gte: rangeStart } },
      select: { createdAt: true, amountUsd: true },
    }),
    prisma.expense.findFirst({
      where,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    fetchExchangeRate(),
  ]);

  const totals = new Map<string, { totalUsd: number; count: number }>();
  for (const r of rows) {
    const key = monthKey(r.createdAt.getFullYear(), r.createdAt.getMonth() + 1);
    const existing = totals.get(key);
    if (existing) {
      existing.totalUsd += r.amountUsd;
      existing.count += 1;
    } else {
      totals.set(key, { totalUsd: r.amountUsd, count: 1 });
    }
  }

  const result: { year: number; month: number; key: string; totalUsd: number; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d.getFullYear(), d.getMonth() + 1);
    const agg = totals.get(key);
    result.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      key,
      totalUsd: Math.round((agg?.totalUsd ?? 0) * 100) / 100,
      count: agg?.count ?? 0,
    });
  }

  return NextResponse.json({
    months: result,
    copRate,
    earliest: earliestExpense
      ? { year: earliestExpense.createdAt.getFullYear(), month: earliestExpense.createdAt.getMonth() + 1 }
      : null,
  });
});
