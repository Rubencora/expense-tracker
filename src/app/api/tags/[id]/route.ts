import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().min(4).optional(),
});

export const PATCH = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tag = await prisma.tag.findFirst({
      where: { id, userId },
    });

    if (!tag) {
      return NextResponse.json(
        { error: "Etiqueta no encontrada" },
        { status: 404 }
      );
    }

    if (parsed.data.name && parsed.data.name !== tag.name) {
      const duplicate = await prisma.tag.findFirst({
        where: { userId, name: parsed.data.name },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "Ya existe una etiqueta con ese nombre" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.tag.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update tag error:", error);
    return NextResponse.json(
      { error: "Error al actualizar la etiqueta" },
      { status: 500 }
    );
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;

    const tag = await prisma.tag.findFirst({
      where: { id, userId },
    });

    if (!tag) {
      return NextResponse.json(
        { error: "Etiqueta no encontrada" },
        { status: 404 }
      );
    }

    await prisma.tag.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete tag error:", error);
    return NextResponse.json(
      { error: "Error al eliminar la etiqueta" },
      { status: 500 }
    );
  }
});
