import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateDebtSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  kind: z.enum(["CREDIT_CARD", "LOAN", "PERSONAL", "TAX", "OTHER"]).optional(),
  currency: z.enum(["COP", "USD"]).optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const PATCH = authMiddleware(async (req, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateDebtSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const debt = await prisma.debt.findFirst({ where: { id, userId } });
    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    const { name, kind, currency, creditLimit, isActive, sortOrder, notes } = parsed.data;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (kind !== undefined) data.kind = kind;
    if (currency !== undefined) data.currency = currency;
    if (creditLimit !== undefined) data.creditLimit = creditLimit;
    if (isActive !== undefined) data.isActive = isActive;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (notes !== undefined) data.notes = notes;

    const updated = await prisma.debt.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update debt error:", error);
    return NextResponse.json({ error: "Error al actualizar la deuda" }, { status: 500 });
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const debt = await prisma.debt.findFirst({ where: { id, userId } });
    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }
    await prisma.debt.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete debt error:", error);
    return NextResponse.json({ error: "Error al eliminar la deuda" }, { status: 500 });
  }
});
