import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const POST = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  const { id } = await params;

  try {
    const membership = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: id, userId } },
    });

    if (!membership) {
      return NextResponse.json({ error: "No eres miembro de este espacio" }, { status: 404 });
    }

    if (membership.role === "OWNER") {
      return NextResponse.json(
        { error: "El owner no puede salir del espacio. Eliminalo en su lugar." },
        { status: 400 }
      );
    }

    // Clear defaultSpaceId if this was the user's default
    await prisma.user.update({
      where: { id: userId },
      data: { defaultSpaceId: null },
    });

    // Remove membership
    await prisma.spaceMember.delete({
      where: { spaceId_userId: { spaceId: id, userId } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leave space error:", error);
    return NextResponse.json({ error: "Error al salir del espacio" }, { status: 500 });
  }
});
