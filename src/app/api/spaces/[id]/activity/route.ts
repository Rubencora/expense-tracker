import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSpaceMember } from "@/lib/space-auth";

export const GET = authMiddleware(async (req: NextRequest, { params, userId }) => {
  const { id } = await params;

  // Verify membership
  const isMember = await isSpaceMember(id, userId);
  if (!isMember) {
    return NextResponse.json(
      { error: "No eres miembro de este espacio" },
      { status: 403 }
    );
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "all";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);

  // Fetch expenses (if applicable)
  const expenses =
    type === "settlements"
      ? []
      : await prisma.expense.findMany({
          where: { spaceId: id },
          include: {
            user: { select: { id: true, name: true } },
            category: { select: { name: true, emoji: true } },
            splits: { select: { owedByUserId: true, amountUsd: true, isSettled: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

  // Fetch settlements (if applicable)
  const settlements =
    type === "expenses"
      ? []
      : await prisma.settlement.findMany({
          where: { spaceId: id },
          include: {
            fromUser: { select: { id: true, name: true } },
            toUser: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });

  // Transform into unified activity items
  const expenseItems = expenses.map((e) => ({
    type: "expense" as const,
    id: e.id,
    date: e.createdAt,
    user: { id: e.user.id, name: e.user.name },
    merchant: e.merchant,
    amount: e.amount,
    currency: e.currency,
    amountUsd: e.amountUsd,
    category: { name: e.category.name, emoji: e.category.emoji },
    splitType: e.splitType,
    splitCount: e.splits.length,
  }));

  const settlementItems = settlements.map((s) => ({
    type: "settlement" as const,
    id: s.id,
    date: s.createdAt,
    fromUser: { id: s.fromUser.id, name: s.fromUser.name },
    toUser: { id: s.toUser.id, name: s.toUser.name },
    amountUsd: s.amountUsd,
    note: s.note,
  }));

  // Merge, sort by date descending, and take limit
  const activity = [...expenseItems, ...settlementItems]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);

  return NextResponse.json({ activity });
});
