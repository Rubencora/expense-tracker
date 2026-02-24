import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";

const contributeSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(["COP", "USD"]),
  note: z.string().nullable().optional(),
});

export const POST = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = contributeSchema.safeParse(body);

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

    const { amount, currency, note } = parsed.data;
    const amountUsd = await convertToUSD(amount, currency);

    // Create the contribution (no $transaction - PrismaPg doesn't support batch)
    const contribution = await prisma.savingsContribution.create({
      data: {
        goalId: id,
        amountUsd,
        note: note ?? null,
      },
    });

    // Update the goal's currentAmountUsd
    const newCurrentAmountUsd = goal.currentAmountUsd + amountUsd;
    const isNowCompleted = newCurrentAmountUsd >= goal.targetAmountUsd;

    const updatedGoal = await prisma.savingsGoal.update({
      where: { id },
      data: {
        currentAmountUsd: newCurrentAmountUsd,
        ...(isNowCompleted && !goal.isCompleted ? { isCompleted: true } : {}),
      },
    });

    return NextResponse.json(
      { contribution, goal: updatedGoal },
      { status: 201 }
    );
  } catch (error) {
    console.error("Contribute to savings goal error:", error);
    return NextResponse.json(
      { error: "Error al registrar la contribucion" },
      { status: 500 }
    );
  }
});
