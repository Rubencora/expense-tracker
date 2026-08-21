import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateGroupSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = authMiddleware(async (req, { params, userId }) => {
  try {
    const { groupId } = await params;
    const parsed = updateGroupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const group = await prisma.debtNoteGroup.findFirst({ where: { id: groupId, userId } });
    if (!group) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }
    const updated = await prisma.debtNoteGroup.update({
      where: { id: groupId },
      data: parsed.data,
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({ ...updated, total: updated.items.reduce((s, i) => s + i.amount, 0) });
  } catch (error) {
    console.error("Update note group error:", error);
    return NextResponse.json({ error: "Error al actualizar el grupo" }, { status: 500 });
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { groupId } = await params;
    const group = await prisma.debtNoteGroup.findFirst({ where: { id: groupId, userId } });
    if (!group) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }
    await prisma.debtNoteGroup.delete({ where: { id: groupId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete note group error:", error);
    return NextResponse.json({ error: "Error al eliminar el grupo" }, { status: 500 });
  }
});
