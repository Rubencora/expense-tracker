import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createCategorySchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  emoji: z.string().min(1, "Emoji requerido"),
  color: z.string().min(4, "Color requerido"),
});

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
  });

  return NextResponse.json(categories);
});

export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, emoji, color } = parsed.data;

    const maxSort = await prisma.category.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });

    const category = await prisma.category.create({
      data: {
        userId,
        name,
        emoji,
        color,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Create category error:", error);
    return NextResponse.json(
      { error: "Error al crear la categoria" },
      { status: 500 }
    );
  }
});
