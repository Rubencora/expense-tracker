import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const addTagSchema = z.object({
  tagId: z.string().min(1, "Tag ID requerido"),
});

export const GET = authMiddleware(async (_req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;

    const expense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Gasto no encontrado" },
        { status: 404 }
      );
    }

    const expenseTags = await prisma.expenseTag.findMany({
      where: { expenseId: id },
      include: {
        tag: {
          select: { id: true, name: true, color: true, createdAt: true },
        },
      },
    });

    const tags = expenseTags.map((et) => et.tag);

    return NextResponse.json(tags);
  } catch (error) {
    console.error("Get expense tags error:", error);
    return NextResponse.json(
      { error: "Error al obtener las etiquetas del gasto" },
      { status: 500 }
    );
  }
});

export const POST = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = addTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tagId } = parsed.data;

    const expense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Gasto no encontrado" },
        { status: 404 }
      );
    }

    const tag = await prisma.tag.findFirst({
      where: { id: tagId, userId },
    });

    if (!tag) {
      return NextResponse.json(
        { error: "Etiqueta no encontrada" },
        { status: 404 }
      );
    }

    const existing = await prisma.expenseTag.findFirst({
      where: { expenseId: id, tagId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "La etiqueta ya esta asignada a este gasto" },
        { status: 409 }
      );
    }

    const expenseTag = await prisma.expenseTag.create({
      data: {
        expenseId: id,
        tagId,
      },
      include: {
        tag: {
          select: { id: true, name: true, color: true, createdAt: true },
        },
      },
    });

    return NextResponse.json(expenseTag, { status: 201 });
  } catch (error) {
    console.error("Add tag to expense error:", error);
    return NextResponse.json(
      { error: "Error al asignar la etiqueta al gasto" },
      { status: 500 }
    );
  }
});

export const DELETE = authMiddleware(async (req: NextRequest, { params, userId }) => {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId");

    if (!tagId) {
      return NextResponse.json(
        { error: "tagId es requerido como query param" },
        { status: 400 }
      );
    }

    const expense = await prisma.expense.findFirst({
      where: { id, userId },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Gasto no encontrado" },
        { status: 404 }
      );
    }

    const expenseTag = await prisma.expenseTag.findFirst({
      where: { expenseId: id, tagId },
    });

    if (!expenseTag) {
      return NextResponse.json(
        { error: "La etiqueta no esta asignada a este gasto" },
        { status: 404 }
      );
    }

    await prisma.expenseTag.delete({ where: { id: expenseTag.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove tag from expense error:", error);
    return NextResponse.json(
      { error: "Error al remover la etiqueta del gasto" },
      { status: 500 }
    );
  }
});
