import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyExpense } from "@/lib/ai/classify";

const suggestSchema = z.object({
  merchant: z.string().min(1),
});

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();
    const parsed = suggestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos" },
        { status: 400 }
      );
    }

    const categories = await prisma.category.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, emoji: true },
    });

    const result = await classifyExpense(parsed.data.merchant, categories);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Suggest error:", error);
    return NextResponse.json(
      { error: "Error al sugerir categoria" },
      { status: 500 }
    );
  }
});
