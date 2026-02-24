import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  const { id } = await params;

  try {
    const membership = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: id, userId } },
    });

    if (!membership) {
      return NextResponse.json({ error: "No eres miembro de este espacio" }, { status: 403 });
    }

    if (membership.role !== "OWNER") {
      return NextResponse.json({ error: "Solo el owner puede eliminar el espacio" }, { status: 403 });
    }

    // Clear defaultSpaceId for users who have this space as default
    await prisma.user.updateMany({
      where: { defaultSpaceId: id },
      data: { defaultSpaceId: null },
    });

    // Detach expenses from this space (keep them as personal)
    await prisma.expense.updateMany({
      where: { spaceId: id },
      data: { spaceId: null },
    });

    // Delete the space (cascades: members, invitations)
    await prisma.space.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete space error:", error);
    return NextResponse.json({ error: "Error al eliminar el espacio" }, { status: 500 });
  }
});
