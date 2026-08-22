import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSchedule, summarize, type LoanTrackingMode } from "@/lib/loans";

const updateLoanSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  principal: z.number().positive().optional(),
  monthlyRate: z.number().min(0).max(1).optional(),
  termMonths: z.number().int().min(1).max(600).optional(),
  startYear: z.number().int().min(2000).max(2100).optional(),
  startMonth: z.number().int().min(1).max(12).optional(),
  trackingMode: z.enum(["SCHEDULE", "PAYMENTS"]).optional(),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function loadLoanDetail(id: string, userId: string) {
  const loan = await prisma.loan.findFirst({
    where: { id, userId },
    include: { periods: { orderBy: { period: "asc" } } },
  });
  if (!loan) return null;
  const { periods, ...rest } = loan;
  const like = { ...rest, trackingMode: rest.trackingMode as LoanTrackingMode };
  const today = new Date();
  const rows = buildSchedule(like, periods, today);
  return { loan: rest, rows, summary: summarize(like, rows, today) };
}

/** GET /api/loans/:id → loan + full schedule (theoretical + real) + summary */
export const GET = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  const { id } = await params;
  const detail = await loadLoanDetail(id, userId);
  if (!detail) {
    return NextResponse.json({ error: "Credito no encontrado" }, { status: 404 });
  }
  return NextResponse.json(detail);
});

export const PATCH = authMiddleware(async (req, { params, userId }) => {
  try {
    const { id } = await params;
    const parsed = updateLoanSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const existing = await prisma.loan.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Credito no encontrado" }, { status: 404 });
    }
    await prisma.loan.update({ where: { id }, data: parsed.data });
    const detail = await loadLoanDetail(id, userId);
    return NextResponse.json(detail);
  } catch (error) {
    console.error("Update loan error:", error);
    return NextResponse.json({ error: "Error al actualizar el credito" }, { status: 500 });
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const existing = await prisma.loan.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Credito no encontrado" }, { status: 404 });
    }
    await prisma.loan.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete loan error:", error);
    return NextResponse.json({ error: "Error al eliminar el credito" }, { status: 500 });
  }
});
