import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createWebhookSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  url: z.string().url("URL invalida"),
  secret: z.string().nullable().optional(),
});

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        url: true,
        isActive: true,
        secret: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ webhooks });
  } catch (error) {
    console.error("List webhooks error:", error);
    return NextResponse.json(
      { error: "Error al obtener los webhooks" },
      { status: 500 }
    );
  }
});

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, url, secret } = parsed.data;

    const webhook = await prisma.webhook.create({
      data: {
        userId,
        name,
        url,
        secret: secret || null,
      },
    });

    return NextResponse.json(webhook, { status: 201 });
  } catch (error) {
    console.error("Create webhook error:", error);
    return NextResponse.json(
      { error: "Error al crear el webhook" },
      { status: 500 }
    );
  }
});
