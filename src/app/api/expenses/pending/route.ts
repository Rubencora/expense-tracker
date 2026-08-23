import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/expenses/pending
 * Every expense with no amount yet (source SHORTCUT, amount 0), across all time
 * — not scoped to "this month" like the main Gastos list. Used by the
 * "Completar pendientes" quick-fill screen.
 */
export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const order = searchParams.get("order") === "recent" ? "desc" : "asc";

  const expenses = await prisma.expense.findMany({
    where: { userId, amount: 0 },
    include: { category: { select: { id: true, name: true, emoji: true } } },
    orderBy: { createdAt: order },
  });

  return NextResponse.json({ expenses, count: expenses.length });
});
