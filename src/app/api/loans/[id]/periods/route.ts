import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadLoanDetail } from "../route";

const upsertPeriodSchema = z.object({
  period: z.number().int().min(1).max(600),
  payment: z.number().min(0).nullable().optional(),
  extraPayment: z.number().min(0).nullable().optional(),
  balanceOverride: z.number().min(0).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

/**
 * PUT /api/loans/:id/periods
 * Upserts the user inputs of one period (pago real, abono extra, saldo real, nota).
 * Only provided fields change; `null` clears a field. Returns the recomputed detail.
 */
export const PUT = authMiddleware(async (req, { params, userId }) => {
  try {
    const { id } = await params;
    const parsed = upsertPeriodSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const loan = await prisma.loan.findFirst({ where: { id, userId }, select: { termMonths: true } });
    if (!loan) {
      return NextResponse.json({ error: "Credito no encontrado" }, { status: 404 });
    }
    const { period, ...fields } = parsed.data;
    if (period > loan.termMonths) {
      return NextResponse.json({ error: "Periodo fuera del plazo del credito" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) update[k] = v;
    }

    await prisma.loanPeriod.upsert({
      where: { loanId_period: { loanId: id, period } },
      create: {
        loanId: id,
        period,
        payment: fields.payment ?? null,
        extraPayment: fields.extraPayment ?? null,
        balanceOverride: fields.balanceOverride ?? null,
        note: fields.note ?? null,
      },
      update,
    });

    const detail = await loadLoanDetail(id, userId);
    return NextResponse.json(detail);
  } catch (error) {
    console.error("Upsert loan period error:", error);
    return NextResponse.json({ error: "Error al guardar el periodo" }, { status: 500 });
  }
});
