import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  monthlyLimitUsd: z.number().positive(),
});

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  const budgets = await prisma.budget.findMany({
    where: { userId },
    include: {
      category: { select: { id: true, name: true, emoji: true, color: true } },
    },
  });

  return NextResponse.json(budgets);
});

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createBudgetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { categoryId, monthlyLimitUsd } = parsed.data;

    // Verify category belongs to user
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "Categoria no encontrada" },
        { status: 404 }
      );
    }

    const budget = await prisma.budget.upsert({
      where: { userId_categoryId: { userId, categoryId } },
      update: { monthlyLimitUsd },
      create: { userId, categoryId, monthlyLimitUsd },
      include: {
        category: { select: { id: true, name: true, emoji: true, color: true } },
      },
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    console.error("Create budget error:", error);
    return NextResponse.json(
      { error: "Error al crear el presupuesto" },
      { status: 500 }
    );
  }
});
