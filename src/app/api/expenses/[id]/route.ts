import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";

const updateExpenseSchema = z.object({
  merchant: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(["COP", "USD"]).optional(),
  categoryId: z.string().optional(),
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;

    const expense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Gasto no encontrado" },
        { status: 404 }
      );
    }

    // Delete expense (cascade deletes splits + tags)
    await prisma.expense.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete expense error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el gasto" },
      { status: 500 }
    );
  }
});

export const PATCH = authMiddleware(async (req, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Gasto no encontrado" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    const { merchant, amount, currency, categoryId } = parsed.data;

    if (merchant !== undefined) data.merchant = merchant;
    if (categoryId !== undefined) {
      const cat = await prisma.category.findFirst({ where: { id: categoryId, userId } });
      if (!cat) {
        return NextResponse.json({ error: "Categoria no encontrada" }, { status: 404 });
      }
      data.categoryId = categoryId;
    }
    if (amount !== undefined || currency !== undefined) {
      const newAmount = amount ?? expense.amount;
      const newCurrency = currency ?? expense.currency;
      data.amount = newAmount;
      data.currency = newCurrency;
      data.amountUsd = await convertToUSD(newAmount, newCurrency);
    }

    const updated = await prisma.expense.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true, emoji: true, color: true } },
        space: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update expense error:", error);
    return NextResponse.json(
      { error: "Error al actualizar el gasto" },
      { status: 500 }
    );
  }
});
