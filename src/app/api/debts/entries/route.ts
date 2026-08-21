import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const upsertEntrySchema = z.object({
  debtId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  balance: z.number().nonnegative().optional(),
  payment: z.number().nonnegative().optional(),
  note: z.string().max(300).nullable().optional(),
});

/**
 * PUT /api/debts/entries
 * Upserts the (saldo, pago) cell of one debt for one month.
 * Only the provided fields are updated; missing ones keep their value (or 0 on create).
 */
export const PUT = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertEntrySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { debtId, year, month, balance, payment, note } = parsed.data;

    const debt = await prisma.debt.findFirst({ where: { id: debtId, userId }, select: { id: true } });
    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    if (balance !== undefined) update.balance = balance;
    if (payment !== undefined) update.payment = payment;
    if (note !== undefined) update.note = note;

    const entry = await prisma.debtEntry.upsert({
      where: { debtId_year_month: { debtId, year, month } },
      create: {
        debtId,
        year,
        month,
        balance: balance ?? 0,
        payment: payment ?? 0,
        note: note ?? null,
      },
      update,
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Upsert debt entry error:", error);
    return NextResponse.json({ error: "Error al guardar el registro" }, { status: 500 });
  }
});

const deleteEntrySchema = z.object({
  debtId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export const DELETE = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = deleteEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    const { debtId, year, month } = parsed.data;
    const debt = await prisma.debt.findFirst({ where: { id: debtId, userId }, select: { id: true } });
    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }
    await prisma.debtEntry.deleteMany({ where: { debtId, year, month } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete debt entry error:", error);
    return NextResponse.json({ error: "Error al eliminar el registro" }, { status: 500 });
  }
});
