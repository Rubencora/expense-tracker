import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  const invitation = await prisma.spaceInvitation.findUnique({
    where: { token },
    include: {
      space: { select: { name: true } },
      inviter: { select: { name: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitacion no encontrada" }, { status: 404 });
  }

  const expired = invitation.expiresAt < new Date();
  const valid = invitation.status === "PENDING" && !expired;

  return NextResponse.json({
    spaceName: invitation.space.name,
    inviterName: invitation.inviter.name,
    email: invitation.email,
    status: expired && invitation.status === "PENDING" ? "EXPIRED" : invitation.status,
    valid,
  });
}
