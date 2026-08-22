import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSchedule, summarize, type LoanTrackingMode } from "@/lib/loans";

export const loanBodySchema = z.object({
  name: z.string().min(1).max(80),
  principal: z.number().positive(),
  monthlyRate: z.number().min(0).max(1), // 0.011 = 1.1 % monthly
  termMonths: z.number().int().min(1).max(600),
  startYear: z.number().int().min(2000).max(2100),
  startMonth: z.number().int().min(1).max(12),
  trackingMode: z.enum(["SCHEDULE", "PAYMENTS"]).default("SCHEDULE"),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

/** GET /api/loans?includeInactive=true → loans with their computed summary */
export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  const loans = await prisma.loan.findMany({
    where: { userId, ...(includeInactive ? {} : { isActive: true }) },
    include: { periods: { orderBy: { period: "asc" } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const today = new Date();
  return NextResponse.json({
    loans: loans.map(({ periods, ...loan }) => {
      const like = { ...loan, trackingMode: loan.trackingMode as LoanTrackingMode };
      const rows = buildSchedule(like, periods, today);
      return { ...loan, summary: summarize(like, rows, today) };
    }),
  });
});

/** POST /api/loans → create a loan */
export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const parsed = loanBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const last = await prisma.loan.findFirst({
      where: { userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const loan = await prisma.loan.create({
      data: { userId, ...parsed.data, notes: parsed.data.notes ?? null, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    const like = { ...loan, trackingMode: loan.trackingMode as LoanTrackingMode };
    const rows = buildSchedule(like, []);
    return NextResponse.json({ ...loan, summary: summarize(like, rows) }, { status: 201 });
  } catch (error) {
    console.error("Create loan error:", error);
    return NextResponse.json({ error: "Error al crear el credito" }, { status: 500 });
  }
});
