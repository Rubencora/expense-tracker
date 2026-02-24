import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signAccessToken, verifyRefreshToken } from "@/lib/auth";

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token requerido"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { refreshToken } = parsed.data;

    const payload = verifyRefreshToken(refreshToken);
    const accessToken = signAccessToken({
      userId: payload.userId,
      email: payload.email,
    });

    return NextResponse.json({ accessToken });
  } catch {
    return NextResponse.json(
      { error: "Refresh token invalido o expirado" },
      { status: 401 }
    );
  }
}
