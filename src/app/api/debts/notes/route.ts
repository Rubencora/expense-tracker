import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const itemSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().finite().optional().default(0),
});

const createGroupSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  title: z.string().min(1).max(80),
  items: z.array(itemSchema).max(100).optional(),
});

const groupInclude = { items: { orderBy: { sortOrder: "asc" as const } } };

/** GET /api/debts/notes?year=YYYY&month=M → groups (with items and total) of that month */
export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "year y month requeridos" }, { status: 400 });
  }

  const groups = await prisma.debtNoteGroup.findMany({
    where: { userId, year, month },
    include: groupInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({
    groups: groups.map((g) => ({ ...g, total: g.items.reduce((s, i) => s + i.amount, 0) })),
  });
});

/** POST /api/debts/notes → create a group (optionally with items) */
export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { year, month, title, items } = parsed.data;

    const last = await prisma.debtNoteGroup.findFirst({
      where: { userId, year, month },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const group = await prisma.debtNoteGroup.create({
      data: {
        userId,
        year,
        month,
        title,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        items: items?.length
          ? { create: items.map((it, idx) => ({ label: it.label, amount: it.amount, sortOrder: idx })) }
          : undefined,
      },
      include: groupInclude,
    });

    return NextResponse.json(
      { ...group, total: group.items.reduce((s, i) => s + i.amount, 0) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create note group error:", error);
    return NextResponse.json({ error: "Error al crear el grupo" }, { status: 500 });
  }
});
