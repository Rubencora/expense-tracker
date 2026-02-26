import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyPasswordResetToken } from "@/lib/auth";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos. La contrasena debe tener al menos 6 caracteres." },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // We need to find the user first to get their passwordHash for verification
    // Decode the token without verification to get userId
    const parts = token.split(".");
    if (parts.length !== 3) {
      return NextResponse.json(
        { error: "Token invalido" },
        { status: 400 }
      );
    }

    let userId: string;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      userId = payload.userId;
    } catch {
      return NextResponse.json(
        { error: "Token invalido" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Token invalido o expirado" },
        { status: 400 }
      );
    }

    // Now verify the token with the user's current passwordHash
    try {
      verifyPasswordResetToken(token, user.passwordHash);
    } catch {
      return NextResponse.json(
        { error: "Token invalido o expirado" },
        { status: 400 }
      );
    }

    // Hash new password and update
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Error al restablecer la contrasena" },
      { status: 500 }
    );
  }
}
