import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET /api/expenses/shortcut/events → last payloads received from the iOS shortcut (diagnostics). */
export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));
  const events = await prisma.shortcutEvent.findMany({
    where: { userId },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
  const pendingCount = await prisma.expense.count({ where: { userId, source: "SHORTCUT", amount: 0 } });
  return NextResponse.json({ events, pendingCount });
});
