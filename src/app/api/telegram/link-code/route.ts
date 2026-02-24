import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { generateLinkingCode } from "@/lib/telegram/bot";

export const POST = authMiddleware(async (_req: NextRequest, { userId }) => {
  try {
    const code = await generateLinkingCode(userId);
    return NextResponse.json({ code, expiresIn: "10 minutos" });
  } catch (error) {
    console.error("Error generating link code:", error);
    return NextResponse.json(
      { error: "Error al generar el codigo de vinculacion" },
      { status: 500 }
    );
  }
});
