import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_EVENTS = [
  "expense.created",
  "expense.deleted",
  "income.created",
  "goal.contributed",
  "budget.exceeded",
] as const;

const updateWebhookSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url("URL invalida").optional(),
  isActive: z.boolean().optional(),
  secret: z.string().nullable().optional(),
  events: z
    .array(z.enum(VALID_EVENTS))
    .min(1, "Debe seleccionar al menos un evento")
    .optional(),
});

export const PATCH = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const webhook = await prisma.webhook.findFirst({
      where: { id, userId },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook no encontrado" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    const { name, url, isActive, secret, events } = parsed.data;

    if (name !== undefined) data.name = name;
    if (url !== undefined) data.url = url;
    if (isActive !== undefined) data.isActive = isActive;
    if (secret !== undefined) data.secret = secret;
    if (events !== undefined) data.events = events;

    const updated = await prisma.webhook.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update webhook error:", error);
    return NextResponse.json(
      { error: "Error al actualizar el webhook" },
      { status: 500 }
    );
  }
});

export const DELETE = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;

    const webhook = await prisma.webhook.findFirst({
      where: { id, userId },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook no encontrado" },
        { status: 404 }
      );
    }

    await prisma.webhook.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete webhook error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el webhook" },
      { status: 500 }
    );
  }
});
