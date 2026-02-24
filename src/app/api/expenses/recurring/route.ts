import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const expenses = await prisma.expense.findMany({
    where: { userId, createdAt: { gte: twoMonthsAgo } },
    select: { merchant: true, amountUsd: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // Group by normalized merchant
  const merchantGroups = new Map<
    string,
    { amounts: number[]; dates: Date[] }
  >();

  for (const e of expenses) {
    const key = e.merchant.toLowerCase().trim();
    const group = merchantGroups.get(key);
    if (group) {
      group.amounts.push(e.amountUsd);
      group.dates.push(e.createdAt);
    } else {
      merchantGroups.set(key, {
        amounts: [e.amountUsd],
        dates: [e.createdAt],
      });
    }
  }

  // Filter: 2+ occurrences with similar amounts (+-20%)
  const recurring = Array.from(merchantGroups.entries())
    .filter(([, group]) => {
      if (group.amounts.length < 2) return false;
      const avg = group.amounts.reduce((s, a) => s + a, 0) / group.amounts.length;
      const allSimilar = group.amounts.every(
        (a) => Math.abs(a - avg) / avg <= 0.2
      );
      return allSimilar;
    })
    .map(([name, group]) => {
      const avg = group.amounts.reduce((s, a) => s + a, 0) / group.amounts.length;
      const daysBetween =
        group.dates.length >= 2
          ? Math.abs(
              group.dates[0].getTime() -
                group.dates[group.dates.length - 1].getTime()
            ) /
            (1000 * 60 * 60 * 24 * (group.dates.length - 1))
          : 30;

      let frequency: string;
      if (daysBetween <= 8) frequency = "Semanal";
      else if (daysBetween <= 20) frequency = "Quincenal";
      else frequency = "Mensual";

      return {
        merchant: name.charAt(0).toUpperCase() + name.slice(1),
        avgAmount: Math.round(avg * 100) / 100,
        count: group.amounts.length,
        frequency,
      };
    })
    .sort((a, b) => b.avgAmount - a.avgAmount);

  return NextResponse.json(recurring);
});
