import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createTagSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(50),
  color: z.string().min(4).optional(),
});

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { expenses: true },
        },
      },
    });

    const result = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      createdAt: tag.createdAt,
      expenseCount: tag._count.expenses,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("List tags error:", error);
    return NextResponse.json(
      { error: "Error al listar las etiquetas" },
      { status: 500 }
    );
  }
});

export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, color } = parsed.data;

    const existing = await prisma.tag.findFirst({
      where: { userId, name },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una etiqueta con ese nombre" },
        { status: 409 }
      );
    }

    const tag = await prisma.tag.create({
      data: {
        userId,
        name,
        ...(color !== undefined && { color }),
      },
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    console.error("Create tag error:", error);
    return NextResponse.json(
      { error: "Error al crear la etiqueta" },
      { status: 500 }
    );
  }
});
