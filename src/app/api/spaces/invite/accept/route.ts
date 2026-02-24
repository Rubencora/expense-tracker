import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const acceptSchema = z.object({
  token: z.string().min(1, "Token requerido"),
});

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    const { token } = parsed.data;

    const invitation = await prisma.spaceInvitation.findUnique({
      where: { token },
      include: { space: { select: { id: true, name: true } } },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitacion no encontrada" }, { status: 404 });
    }

    if (invitation.status !== "PENDING") {
      return NextResponse.json({ error: "Esta invitacion ya fue utilizada" }, { status: 400 });
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.spaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "Esta invitacion ha expirado" }, { status: 400 });
    }

    // Check if already a member
    const existingMembership = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: invitation.spaceId, userId } },
    });

    if (existingMembership) {
      // Mark invitation as accepted even if already a member
      await prisma.spaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      });
      return NextResponse.json({
        success: true,
        message: "Ya eres miembro de este espacio",
        space: invitation.space,
      });
    }

    // Create membership and mark invitation as accepted
    await prisma.$transaction([
      prisma.spaceMember.create({
        data: { spaceId: invitation.spaceId, userId, role: "MEMBER" },
      }),
      prisma.spaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Te uniste al espacio "${invitation.space.name}"`,
      space: invitation.space,
    });
  } catch (error) {
    console.error("Accept invitation error:", error);
    return NextResponse.json({ error: "Error al aceptar la invitacion" }, { status: 500 });
  }
});
