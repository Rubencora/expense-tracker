import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";
import { Prisma } from "@/generated/prisma/client";
import { isSpaceMember } from "@/lib/space-auth";

const createExpenseSchema = z.object({
  merchant: z.string().min(1, "Comercio requerido"),
  amount: z.number().positive("El monto debe ser positivo"),
  currency: z.enum(["COP", "USD"]),
  categoryId: z.string().min(1, "Categoria requerida"),
  spaceId: z.string().optional(),
  descriptionAi: z.string().optional(),
});

export const GET = authMiddleware(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const spaceId = searchParams.get("spaceId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = searchParams.get("search");
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Prisma.ExpenseWhereInput = {};

  if (spaceId && spaceId !== "personal") {
    // Shared space: verify membership, show ALL members' expenses
    const isMember = await isSpaceMember(spaceId, userId);
    if (!isMember) {
      return NextResponse.json({ error: "No eres miembro de este espacio" }, { status: 403 });
    }
    where.spaceId = spaceId;
  } else if (spaceId === "personal") {
    where.userId = userId;
    where.spaceId = null;
  } else {
    // No spaceId (all tab): only user's own expenses
    where.userId = userId;
  }

  if (categoryId) where.categoryId = categoryId;
  if (dateFrom) where.createdAt = { ...((where.createdAt as Prisma.DateTimeFilter) || {}), gte: new Date(dateFrom) };
  if (dateTo) where.createdAt = { ...((where.createdAt as Prisma.DateTimeFilter) || {}), lte: new Date(dateTo) };
  if (search) where.merchant = { contains: search, mode: "insensitive" };

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: { select: { id: true, name: true, emoji: true, color: true } },
      space: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = expenses.length > limit;
  const data = hasMore ? expenses.slice(0, limit) : expenses;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return NextResponse.json({
    expenses: data,
    nextCursor,
    hasMore,
  });
});

export const POST = authMiddleware(async (req, { userId }) => {
  try {
    const body = await req.json();
    const parsed = createExpenseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { merchant, amount, currency, categoryId, spaceId, descriptionAi } = parsed.data;

    // Verify category belongs to user
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "Categoria no encontrada" },
        { status: 404 }
      );
    }

    const amountUsd = await convertToUSD(amount, currency);

    const expense = await prisma.expense.create({
      data: {
        userId,
        merchant,
        amount,
        currency,
        amountUsd,
        categoryId,
        spaceId: spaceId || null,
        descriptionAi: descriptionAi || null,
        source: "WEB",
      },
      include: {
        category: { select: { id: true, name: true, emoji: true, color: true } },
      },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { error: "Error al crear el gasto" },
      { status: 500 }
    );
  }
});
