import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSpaceMember } from "@/lib/space-auth";
import { sendSpaceInvitationEmail } from "@/lib/email";

const inviteSchema = z.object({
  email: z.string().email("Email invalido"),
});

export const POST = authMiddleware(async (req: NextRequest, { params, userId }) => {
  const { id } = await params;

  try {
    const isMember = await isSpaceMember(id, userId);
    if (!isMember) {
      return NextResponse.json({ error: "No eres miembro de este espacio" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Email invalido", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();

    // Check if user is already a member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const alreadyMember = await isSpaceMember(id, existingUser.id);
      if (alreadyMember) {
        return NextResponse.json({ error: "Este usuario ya es miembro del espacio" }, { status: 409 });
      }
    }

    // Check for pending invitation
    const pendingInvite = await prisma.spaceInvitation.findFirst({
      where: { spaceId: id, email, status: "PENDING", expiresAt: { gt: new Date() } },
    });
    if (pendingInvite) {
      return NextResponse.json({ error: "Ya hay una invitacion pendiente para este email" }, { status: 409 });
    }

    // Get inviter info and space name
    const [inviter, space] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.space.findUnique({ where: { id }, select: { name: true } }),
    ]);

    if (!inviter || !space) {
      return NextResponse.json({ error: "Datos no encontrados" }, { status: 404 });
    }

    // Create invitation (7 day expiry)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await prisma.spaceInvitation.create({
      data: {
        spaceId: id,
        email,
        invitedBy: userId,
        expiresAt,
      },
    });

    // Send email
    await sendSpaceInvitationEmail({
      to: email,
      inviterName: inviter.name,
      spaceName: space.name,
      token: invitation.token,
    });

    return NextResponse.json({ success: true, message: `Invitacion enviada a ${email}` }, { status: 201 });
  } catch (error) {
    console.error("Invite to space error:", error);
    return NextResponse.json({ error: "Error al enviar la invitacion" }, { status: 500 });
  }
});
