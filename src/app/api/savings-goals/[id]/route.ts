import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";

const updateGoalSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  targetAmount: z.number().positive().optional(),
  currency: z.enum(["COP", "USD"]).optional(),
  deadline: z.string().nullable().optional(),
  isCompleted: z.boolean().optional(),
});

export const PATCH = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateGoalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const goal = await prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!goal) {
      return NextResponse.json(
        { error: "Meta de ahorro no encontrada" },
        { status: 404 }
      );
    }

    const { name, icon, targetAmount, currency, deadline, isCompleted } = parsed.data;

    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name;
    if (icon !== undefined) data.icon = icon;
    if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;

    // Recalculate targetAmountUsd if targetAmount and currency are provided
    if (targetAmount !== undefined && currency !== undefined) {
      data.targetAmountUsd = await convertToUSD(targetAmount, currency);
    }

    // Handle isCompleted - only mark complete if currentAmountUsd >= targetAmountUsd
    if (isCompleted === true) {
      const effectiveTarget = (data.targetAmountUsd as number) ?? goal.targetAmountUsd;
      if (goal.currentAmountUsd >= effectiveTarget) {
        data.isCompleted = true;
      } else {
        return NextResponse.json(
          { error: "No se puede marcar como completada: el monto actual no alcanza la meta" },
          { status: 400 }
        );
      }
    } else if (isCompleted === false) {
      data.isCompleted = false;
    }

    const updated = await prisma.savingsGoal.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update savings goal error:", error);
    return NextResponse.json(
      { error: "Error al actualizar la meta de ahorro" },
      { status: 500 }
    );
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;

    const goal = await prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!goal) {
      return NextResponse.json(
        { error: "Meta de ahorro no encontrada" },
        { status: 404 }
      );
    }

    await prisma.savingsGoal.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete savings goal error:", error);
    return NextResponse.json(
      { error: "Error al eliminar la meta de ahorro" },
      { status: 500 }
    );
  }
});
