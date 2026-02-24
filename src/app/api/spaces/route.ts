import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSpaceSchema = z.object({
  name: z.string().min(1, "Nombre del espacio requerido"),
});

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  const memberships = await prisma.spaceMember.findMany({
    where: { userId },
    include: {
      space: {
        include: {
          _count: {
            select: {
              members: true,
              expenses: true,
            },
          },
        },
      },
    },
  });

  const spaces = memberships.map((m) => ({
    id: m.space.id,
    name: m.space.name,
    inviteCode: m.space.inviteCode,
    role: m.role,
    memberCount: m.space._count.members,
    expenseCount: m.space._count.expenses,
    createdAt: m.space.createdAt,
  }));

  // Also count personal expenses (no space)
  const personalExpenseCount = await prisma.expense.count({
    where: { userId, spaceId: null },
  });

  return NextResponse.json({
    spaces,
    personalExpenseCount,
  });
});

export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createSpaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

    const space = await prisma.space.create({
      data: {
        name,
        createdBy: userId,
        members: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: {
        _count: { select: { members: true, expenses: true } },
      },
    });

    return NextResponse.json({
      id: space.id,
      name: space.name,
      inviteCode: space.inviteCode,
      role: "OWNER",
      memberCount: space._count.members,
      expenseCount: space._count.expenses,
      createdAt: space.createdAt,
    }, { status: 201 });
  } catch (error) {
    console.error("Create space error:", error);
    return NextResponse.json(
      { error: "Error al crear el espacio" },
      { status: 500 }
    );
  }
});
