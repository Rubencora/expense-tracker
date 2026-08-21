import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateItemSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  amount: z.number().finite().optional(),
  sortOrder: z.number().int().optional(),
});

async function findOwnedItem(itemId: string, userId: string) {
  return prisma.debtNoteItem.findFirst({ where: { id: itemId, group: { userId } } });
}

export const PATCH = authMiddleware(async (req, { params, userId }) => {
  try {
    const { itemId } = await params;
    const parsed = updateItemSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const item = await findOwnedItem(itemId, userId);
    if (!item) {
      return NextResponse.json({ error: "Linea no encontrada" }, { status: 404 });
    }
    const updated = await prisma.debtNoteItem.update({ where: { id: itemId }, data: parsed.data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update note item error:", error);
    return NextResponse.json({ error: "Error al actualizar la linea" }, { status: 500 });
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { itemId } = await params;
    const item = await findOwnedItem(itemId, userId);
    if (!item) {
      return NextResponse.json({ error: "Linea no encontrada" }, { status: 404 });
    }
    await prisma.debtNoteItem.delete({ where: { id: itemId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete note item error:", error);
    return NextResponse.json({ error: "Error al eliminar la linea" }, { status: 500 });
  }
});
