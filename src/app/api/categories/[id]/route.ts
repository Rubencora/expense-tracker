import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  emoji: z.string().min(1).optional(),
  color: z.string().min(4).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateCategorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const category = await prisma.category.findFirst({
      where: { id, userId },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria no encontrada" },
        { status: 404 }
      );
    }

    const updated = await prisma.category.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update category error:", error);
    return NextResponse.json(
      { error: "Error al actualizar la categoria" },
      { status: 500 }
    );
  }
});
