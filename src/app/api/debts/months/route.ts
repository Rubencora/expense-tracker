import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const upsertMonthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  salary: z.number().nonnegative().optional(),
  extraIncome: z.number().optional(),
  trm: z.number().positive().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * PUT /api/debts/months
 * Upserts the per-month parameters (Sueldo, Ingresos extra, TRM, notas).
 */
export const PUT = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertMonthSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { year, month, salary, extraIncome, trm, notes } = parsed.data;

    const update: Record<string, unknown> = {};
    if (salary !== undefined) update.salary = salary;
    if (extraIncome !== undefined) update.extraIncome = extraIncome;
    if (trm !== undefined) update.trm = trm;
    if (notes !== undefined) update.notes = notes;

    const row = await prisma.debtMonth.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: {
        userId,
        year,
        month,
        salary: salary ?? 0,
        extraIncome: extraIncome ?? 0,
        trm: trm ?? null,
        notes: notes ?? null,
      },
      update,
    });

    return NextResponse.json(row);
  } catch (error) {
    console.error("Upsert debt month error:", error);
    return NextResponse.json({ error: "Error al guardar el mes" }, { status: 500 });
  }
});
