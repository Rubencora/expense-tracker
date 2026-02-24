import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  const { id: spaceId } = await params;

  // Verify user is member of this space
  const membership = await prisma.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "No eres miembro de este espacio" },
      { status: 403 }
    );
  }

  const members = await prisma.spaceMember.findMany({
    where: { spaceId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json(
    members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
    }))
  );
});
