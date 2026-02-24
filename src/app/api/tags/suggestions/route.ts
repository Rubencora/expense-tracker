import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const merchant = new URL(req.url).searchParams.get("merchant");
    if (!merchant || merchant.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // Find expenses with similar merchant names
    const relatedExpenses = await prisma.expense.findMany({
      where: {
        userId,
        merchant: { contains: merchant, mode: "insensitive" },
      },
      select: { id: true },
      take: 20,
    });

    if (relatedExpenses.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const expenseIds = relatedExpenses.map((e) => e.id);

    // Find most common tags used on those expenses
    const tagCounts = await prisma.expenseTag.groupBy({
      by: ["tagId"],
      where: { expenseId: { in: expenseIds } },
      _count: true,
      orderBy: { _count: { tagId: "desc" } },
      take: 5,
    });

    return NextResponse.json({
      suggestions: tagCounts.map((t) => t.tagId),
    });
  } catch (error) {
    console.error("Tag suggestions error:", error);
    return NextResponse.json(
      { error: "Error al obtener sugerencias de etiquetas" },
      { status: 500 }
    );
  }
});
