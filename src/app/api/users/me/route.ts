import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  defaultCurrency: z.enum(["COP", "USD"]).optional(),
  timezone: z.string().optional(),
  defaultSpaceId: z.string().nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
});

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      apiToken: true,
      telegramChatId: true,
      defaultCurrency: true,
      timezone: true,
      defaultSpaceId: true,
      onboardingCompleted: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json(user);
});

export const PATCH = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        name: true,
        defaultCurrency: true,
        timezone: true,
        defaultSpaceId: true,
        onboardingCompleted: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Error al actualizar el perfil" },
      { status: 500 }
    );
  }
});
