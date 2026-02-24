import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const POST = authMiddleware(async (_req: NextRequest, { userId }) => {
  try {
    const newToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.update({
      where: { id: userId },
      data: { apiToken: newToken },
      select: { apiToken: true },
    });

    return NextResponse.json({ apiToken: user.apiToken });
  } catch (error) {
    console.error("Regenerate token error:", error);
    return NextResponse.json(
      { error: "Error al regenerar el token" },
      { status: 500 }
    );
  }
});
