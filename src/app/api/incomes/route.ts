import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";
import { Prisma } from "@/generated/prisma/client";

const createIncomeSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  amount: z.number().positive("El monto debe ser positivo"),
  currency: z.enum(["COP", "USD"]),
  frequency: z.enum(["ONCE", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"]),
  isActive: z.boolean().optional().default(true),
  nextDate: z.string().optional(),
  spaceId: z.string().optional(),
  notes: z.string().optional(),
});

export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const isActiveParam = searchParams.get("isActive");
  const spaceId = searchParams.get("spaceId");

  const where: Prisma.IncomeWhereInput = { userId };

  if (isActiveParam !== null) {
    where.isActive = isActiveParam === "true";
  }

  if (spaceId) {
    where.spaceId = spaceId;
  }

  const incomes = await prisma.income.findMany({
    where,
    include: {
      space: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ incomes });
});

export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createIncomeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, amount, currency, frequency, isActive, nextDate, spaceId, notes } = parsed.data;

    const amountUsd = await convertToUSD(amount, currency);

    const income = await prisma.income.create({
      data: {
        userId,
        name,
        amount,
        currency,
        amountUsd,
        frequency,
        isActive,
        nextDate: nextDate ? new Date(nextDate) : null,
        spaceId: spaceId || null,
        notes: notes || null,
      },
      include: {
        space: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(income, { status: 201 });
  } catch (error) {
    console.error("Create income error:", error);
    return NextResponse.json(
      { error: "Error al crear el ingreso" },
      { status: 500 }
    );
  }
});
