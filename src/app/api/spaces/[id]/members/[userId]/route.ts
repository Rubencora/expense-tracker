import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id: spaceId, userId: targetUserId } = await params;

    // Verify requester is owner
    const membership = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId } },
    });

    if (!membership || membership.role !== "OWNER") {
      return NextResponse.json(
        { error: "Solo el owner puede remover miembros" },
        { status: 403 }
      );
    }

    // Can't remove yourself as owner
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: "No puedes removerte a ti mismo" },
        { status: 400 }
      );
    }

    const targetMembership = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId: targetUserId } },
    });

    if (!targetMembership) {
      return NextResponse.json(
        { error: "Miembro no encontrado" },
        { status: 404 }
      );
    }

    await prisma.spaceMember.delete({
      where: { id: targetMembership.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove member error:", error);
    return NextResponse.json(
      { error: "Error al remover el miembro" },
      { status: 500 }
    );
  }
});
