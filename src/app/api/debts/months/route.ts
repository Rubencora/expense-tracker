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

/**
 * GET /api/debts/months?year=YYYY&month=M
 * Usage summary of a month (used before removing a planning column).
 */
export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year y month requeridos" }, { status: 400 });
  }

  const [entries, params, noteGroups] = await Promise.all([
    prisma.debtEntry.count({ where: { year, month, debt: { userId } } }),
    prisma.debtMonth.findUnique({
      where: { userId_year_month: { userId, year, month } },
      select: { salary: true, extraIncome: true, trm: true, notes: true },
    }),
    prisma.debtNoteGroup.count({ where: { userId, year, month } }),
  ]);

  const hasParams =
    !!params && (params.salary !== 0 || params.extraIncome !== 0 || params.trm !== null || !!params.notes);

  return NextResponse.json({
    year,
    month,
    entries,
    hasParams,
    noteGroups,
    hasData: entries > 0 || hasParams || noteGroups > 0,
  });
});

const deleteMonthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

/**
 * DELETE /api/debts/months  body { year, month }
 * Removes everything stored for that month: debt entries, month params and notes.
 */
export const DELETE = authMiddleware(async (req, { userId }) => {
  try {
    const parsed = deleteMonthSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
    }
    const { year, month } = parsed.data;

    const [entries, params, noteGroups] = await prisma.$transaction([
      prisma.debtEntry.deleteMany({ where: { year, month, debt: { userId } } }),
      prisma.debtMonth.deleteMany({ where: { userId, year, month } }),
      prisma.debtNoteGroup.deleteMany({ where: { userId, year, month } }),
    ]);

    return NextResponse.json({
      success: true,
      deleted: { entries: entries.count, params: params.count, noteGroups: noteGroups.count },
    });
  } catch (error) {
    console.error("Delete debt month error:", error);
    return NextResponse.json({ error: "Error al borrar el mes" }, { status: 500 });
  }
});
