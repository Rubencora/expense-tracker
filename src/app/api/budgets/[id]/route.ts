import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateBudgetSchema = z.object({
  monthlyLimitUsd: z.number().positive(),
});

export const PATCH = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateBudgetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos" },
        { status: 400 }
      );
    }

    const budget = await prisma.budget.findFirst({ where: { id, userId } });
    if (!budget) {
      return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
    }

    const updated = await prisma.budget.update({
      where: { id },
      data: { monthlyLimitUsd: parsed.data.monthlyLimitUsd },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update budget error:", error);
    return NextResponse.json(
      { error: "Error al actualizar el presupuesto" },
      { status: 500 }
    );
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;

    const budget = await prisma.budget.findFirst({ where: { id, userId } });
    if (!budget) {
      return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
    }

    await prisma.budget.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete budget error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el presupuesto" },
      { status: 500 }
    );
  }
});
