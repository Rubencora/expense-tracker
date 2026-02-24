import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";

const createGoalSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional().default("🎯"),
  targetAmount: z.number().positive(),
  currency: z.enum(["COP", "USD"]),
  deadline: z.string().nullable().optional(),
});

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  try {
    const goals = await prisma.savingsGoal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        contributions: {
          select: {
            id: true,
            amountUsd: true,
          },
        },
      },
    });

    const goalsWithStats = goals.map((goal) => ({
      ...goal,
      _count: { contributions: goal.contributions.length },
      _sum: {
        contributionsUsd: goal.contributions.reduce(
          (sum, c) => sum + c.amountUsd,
          0
        ),
      },
      contributions: undefined,
    }));

    return NextResponse.json(goalsWithStats);
  } catch (error) {
    console.error("List savings goals error:", error);
    return NextResponse.json(
      { error: "Error al obtener las metas de ahorro" },
      { status: 500 }
    );
  }
});

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createGoalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, icon, targetAmount, currency, deadline } = parsed.data;

    const targetAmountUsd = await convertToUSD(targetAmount, currency);

    const goal = await prisma.savingsGoal.create({
      data: {
        userId,
        name,
        icon,
        targetAmountUsd,
        deadline: deadline ? new Date(deadline) : null,
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error("Create savings goal error:", error);
    return NextResponse.json(
      { error: "Error al crear la meta de ahorro" },
      { status: 500 }
    );
  }
});
