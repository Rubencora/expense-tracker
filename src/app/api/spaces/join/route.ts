import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const joinSchema = z.object({
  inviteCode: z.string().min(1, "Codigo de invitacion requerido"),
});

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();
    const parsed = joinSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { inviteCode } = parsed.data;

    const space = await prisma.space.findUnique({
      where: { inviteCode },
    });

    if (!space) {
      return NextResponse.json(
        { error: "Codigo de invitacion invalido" },
        { status: 404 }
      );
    }

    const existingMember = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: space.id, userId } },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "Ya eres miembro de este espacio" },
        { status: 409 }
      );
    }

    await prisma.spaceMember.create({
      data: {
        spaceId: space.id,
        userId,
        role: "MEMBER",
      },
    });

    return NextResponse.json({
      message: `Te uniste al espacio "${space.name}"`,
      space: { id: space.id, name: space.name },
    });
  } catch (error) {
    console.error("Join space error:", error);
    return NextResponse.json(
      { error: "Error al unirse al espacio" },
      { status: 500 }
    );
  }
});
