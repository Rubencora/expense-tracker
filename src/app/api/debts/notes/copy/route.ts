import { NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const copySchema = z.object({
  fromYear: z.number().int().min(2000).max(2100),
  fromMonth: z.number().int().min(1).max(12),
  toYear: z.number().int().min(2000).max(2100),
  toMonth: z.number().int().min(1).max(12),
});

/**
 * POST /api/debts/notes/copy
 * Copies every group (with its items) from one month to another.
 * Groups whose title already exists in the target month are skipped.
 */
export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const parsed = copySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { fromYear, fromMonth, toYear, toMonth } = parsed.data;
    if (fromYear === toYear && fromMonth === toMonth) {
      return NextResponse.json({ error: "El mes origen y destino son el mismo" }, { status: 400 });
    }

    const [source, existing] = await Promise.all([
      prisma.debtNoteGroup.findMany({
        where: { userId, year: fromYear, month: fromMonth },
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.debtNoteGroup.findMany({
        where: { userId, year: toYear, month: toMonth },
        select: { title: true, sortOrder: true },
      }),
    ]);

    const taken = new Set(existing.map((g) => g.title.trim().toLowerCase()));
    let nextOrder = existing.reduce((m, g) => Math.max(m, g.sortOrder), -1) + 1;
    let copied = 0;

    for (const g of source) {
      if (taken.has(g.title.trim().toLowerCase())) continue;
      await prisma.debtNoteGroup.create({
        data: {
          userId,
          year: toYear,
          month: toMonth,
          title: g.title,
          sortOrder: nextOrder++,
          items: { create: g.items.map((it) => ({ label: it.label, amount: it.amount, sortOrder: it.sortOrder })) },
        },
      });
      copied++;
    }

    const groups = await prisma.debtNoteGroup.findMany({
      where: { userId, year: toYear, month: toMonth },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({
      copied,
      skipped: source.length - copied,
      groups: groups.map((g) => ({ ...g, total: g.items.reduce((s, i) => s + i.amount, 0) })),
    });
  } catch (error) {
    console.error("Copy note groups error:", error);
    return NextResponse.json({ error: "Error al copiar los grupos" }, { status: 500 });
  }
});
