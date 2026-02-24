import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";

const updateIncomeSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(["COP", "USD"]).optional(),
  frequency: z.enum(["ONCE", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"]).optional(),
  isActive: z.boolean().optional(),
  nextDate: z.string().nullable().optional(),
  spaceId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const PATCH = authMiddleware(async (req, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateIncomeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const income = await prisma.income.findFirst({
      where: { id, userId },
    });

    if (!income) {
      return NextResponse.json(
        { error: "Ingreso no encontrado" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    const { name, amount, currency, frequency, isActive, nextDate, spaceId, notes } = parsed.data;

    if (name !== undefined) data.name = name;
    if (frequency !== undefined) data.frequency = frequency;
    if (isActive !== undefined) data.isActive = isActive;
    if (nextDate !== undefined) data.nextDate = nextDate ? new Date(nextDate) : null;
    if (spaceId !== undefined) data.spaceId = spaceId;
    if (notes !== undefined) data.notes = notes;

    // Recalculate amountUsd if amount or currency changes
    if (amount !== undefined || currency !== undefined) {
      const newAmount = amount ?? income.amount;
      const newCurrency = currency ?? income.currency;
      data.amount = newAmount;
      data.currency = newCurrency;
      data.amountUsd = await convertToUSD(newAmount, newCurrency);
    }

    const updated = await prisma.income.update({
      where: { id },
      data,
      include: {
        space: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update income error:", error);
    return NextResponse.json(
      { error: "Error al actualizar el ingreso" },
      { status: 500 }
    );
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;

    const income = await prisma.income.findFirst({
      where: { id, userId },
    });

    if (!income) {
      return NextResponse.json(
        { error: "Ingreso no encontrado" },
        { status: 404 }
      );
    }

    await prisma.income.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete income error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el ingreso" },
      { status: 500 }
    );
  }
});
