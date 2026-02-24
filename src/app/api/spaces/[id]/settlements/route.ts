import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSpaceMember } from "@/lib/space-auth";

// GET /api/spaces/[id]/settlements - List settlement history
export const GET = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  const { id } = await params;

  try {
    const isMember = await isSpaceMember(id, userId);
    if (!isMember) {
      return NextResponse.json(
        { error: "No eres miembro de este espacio" },
        { status: 403 }
      );
    }

    const settlements = await prisma.settlement.findMany({
      where: { spaceId: id },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ settlements });
  } catch (error) {
    console.error("List settlements error:", error);
    return NextResponse.json(
      { error: "Error al obtener liquidaciones" },
      { status: 500 }
    );
  }
});

// POST /api/spaces/[id]/settlements - Create a settlement
const createSettlementSchema = z.object({
  toUserId: z.string(),
  amountUsd: z.number().positive(),
  note: z.string().nullable().optional(),
});

export const POST = authMiddleware(async (req: NextRequest, { params, userId }) => {
  const { id } = await params;

  try {
    const isMember = await isSpaceMember(id, userId);
    if (!isMember) {
      return NextResponse.json(
        { error: "No eres miembro de este espacio" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createSettlementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { toUserId, amountUsd, note } = parsed.data;

    // Create the settlement record
    const settlement = await prisma.settlement.create({
      data: {
        spaceId: id,
        fromUserId: userId,
        toUserId,
        amountUsd,
        note: note ?? null,
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    });

    // Mark corresponding ExpenseSplits as settled, oldest first
    const unsettledSplits = await prisma.expenseSplit.findMany({
      where: {
        owedByUserId: userId,
        paidByUserId: toUserId,
        isSettled: false,
        expense: { spaceId: id },
      },
      orderBy: { createdAt: "asc" },
    });

    let remaining = amountUsd;
    for (const split of unsettledSplits) {
      if (remaining <= 0) break;

      await prisma.expenseSplit.update({
        where: { id: split.id },
        data: { isSettled: true, settledAt: new Date() },
      });

      remaining -= split.amountUsd;
    }

    return NextResponse.json({ settlement });
  } catch (error) {
    console.error("Create settlement error:", error);
    return NextResponse.json(
      { error: "Error al crear liquidacion" },
      { status: 500 }
    );
  }
});
