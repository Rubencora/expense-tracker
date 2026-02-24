import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken } from "@/lib/auth";

const registerSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "La contrasena debe tener al menos 6 caracteres"),
});

const DEFAULT_CATEGORIES = [
  { name: "Alimentacion", emoji: "🍔", color: "#EF4444", sortOrder: 0 },
  { name: "Transporte", emoji: "🚗", color: "#22C55E", sortOrder: 1 },
  { name: "Entretenimiento", emoji: "🎬", color: "#14B8A6", sortOrder: 2 },
  { name: "Compras", emoji: "🛍️", color: "#EAB308", sortOrder: 3 },
  { name: "Salud", emoji: "💊", color: "#DC2626", sortOrder: 4 },
  { name: "Servicios", emoji: "💡", color: "#3B82F6", sortOrder: 5 },
  { name: "Educacion", emoji: "📚", color: "#8B5CF6", sortOrder: 6 },
  { name: "Viajes", emoji: "✈️", color: "#0D9488", sortOrder: 7 },
  { name: "Otros", emoji: "📦", color: "#92400E", sortOrder: 8 },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con este email" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
    });

    // Create default categories
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((cat) => ({
        userId: user.id,
        name: cat.name,
        emoji: cat.emoji,
        color: cat.color,
        isDefault: true,
        isActive: true,
        sortOrder: cat.sortOrder,
      })),
    });

    // Auto-accept any pending invitations for this email
    const pendingInvitations = await prisma.spaceInvitation.findMany({
      where: { email, status: "PENDING", expiresAt: { gt: new Date() } },
    });
    for (const inv of pendingInvitations) {
      const alreadyMember = await prisma.spaceMember.findUnique({
        where: { spaceId_userId: { spaceId: inv.spaceId, userId: user.id } },
      });
      if (!alreadyMember) {
        await prisma.spaceMember.create({
          data: { spaceId: inv.spaceId, userId: user.id, role: "MEMBER" },
        });
      }
      await prisma.spaceInvitation.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED" },
      });
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        apiToken: user.apiToken,
      },
      accessToken,
      refreshToken,
    }, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Error al crear la cuenta" },
      { status: 500 }
    );
  }
}
