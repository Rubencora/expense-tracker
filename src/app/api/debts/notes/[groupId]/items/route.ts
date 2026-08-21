import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createItemSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().finite().optional().default(0),
});

/** POST /api/debts/notes/:groupId/items → add an item at the end of the group */
export const POST = authMiddleware(async (req, { params, userId }) => {
  try {
    const { groupId } = await params;
    const parsed = createItemSchema.safeParse(await req.json());
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
    const last = await prisma.debtNoteItem.findFirst({
      where: { groupId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const item = await prisma.debtNoteItem.create({
      data: { groupId, label: parsed.data.label, amount: parsed.data.amount, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Create note item error:", error);
    return NextResponse.json({ error: "Error al crear la linea" }, { status: 500 });
  }
});
