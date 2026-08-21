import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createDebtSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(80),
  kind: z.enum(["CREDIT_CARD", "LOAN", "PERSONAL", "TAX", "OTHER"]).default("OTHER"),
  currency: z.enum(["COP", "USD"]).default("COP"),
  creditLimit: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  notes: z.string().max(500).nullable().optional(),
});

export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  const debts = await prisma.debt.findMany({
    where: { userId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ debts });
});

export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createDebtSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, kind, currency, creditLimit, isActive, notes } = parsed.data;

    const last = await prisma.debt.findFirst({
      where: { userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const debt = await prisma.debt.create({
      data: {
        userId,
        name,
        kind,
        currency,
        creditLimit: creditLimit ?? null,
        isActive,
        notes: notes || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(debt, { status: 201 });
  } catch (error) {
    console.error("Create debt error:", error);
    return NextResponse.json({ error: "Error al crear la deuda" }, { status: 500 });
  }
});
