import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";
import { ExpenseSource } from "@/generated/prisma/client";

const MAX_BULK_ITEMS = 500;

interface BulkExpenseInput {
  merchant: string;
  amount: number;
  currency: "COP" | "USD";
  categoryId: string;
  date?: string;
}

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  try {
    const body = await req.json();

    if (!body.expenses || !Array.isArray(body.expenses)) {
      return NextResponse.json(
        { error: "Se requiere un array de gastos", created: 0, errors: [] },
        { status: 400 }
      );
    }

    const expenses: BulkExpenseInput[] = body.expenses;

    if (expenses.length === 0) {
      return NextResponse.json(
        { error: "El array de gastos esta vacio", created: 0, errors: [] },
        { status: 400 }
      );
    }

    if (expenses.length > MAX_BULK_ITEMS) {
      return NextResponse.json(
        {
          error: `Maximo ${MAX_BULK_ITEMS} gastos por lote. Recibidos: ${expenses.length}`,
          created: 0,
          errors: [],
        },
        { status: 400 }
      );
    }

    // Get user's defaultSpaceId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { defaultSpaceId: true },
    });

    const spaceId = user?.defaultSpaceId ?? null;

    const errors: string[] = [];
    const validData: {
      userId: string;
      merchant: string;
      amount: number;
      currency: string;
      amountUsd: number;
      categoryId: string;
      spaceId: string | null;
      source: ExpenseSource;
      createdAt: Date;
    }[] = [];

    for (let i = 0; i < expenses.length; i++) {
      const expense = expenses[i];
      const rowLabel = `Fila ${i + 1}`;

      // Validate merchant
      if (!expense.merchant || typeof expense.merchant !== "string" || expense.merchant.trim() === "") {
        errors.push(`${rowLabel}: comercio es requerido`);
        continue;
      }

      // Validate amount
      if (typeof expense.amount !== "number" || expense.amount <= 0 || !isFinite(expense.amount)) {
        errors.push(`${rowLabel}: monto debe ser un numero positivo`);
        continue;
      }

      // Validate currency
      if (expense.currency !== "COP" && expense.currency !== "USD") {
        errors.push(`${rowLabel}: moneda debe ser COP o USD`);
        continue;
      }

      // Validate categoryId
      if (!expense.categoryId || typeof expense.categoryId !== "string") {
        errors.push(`${rowLabel}: categoria es requerida`);
        continue;
      }

      // Convert to USD
      let amountUsd: number;
      try {
        amountUsd = await convertToUSD(expense.amount, expense.currency);
      } catch {
        errors.push(`${rowLabel}: error al convertir moneda`);
        continue;
      }

      // Parse date if provided
      let createdAt = new Date();
      if (expense.date) {
        const parsed = new Date(expense.date);
        if (isNaN(parsed.getTime())) {
          errors.push(`${rowLabel}: fecha invalida`);
          continue;
        }
        createdAt = parsed;
      }

      validData.push({
        userId,
        merchant: expense.merchant.trim(),
        amount: expense.amount,
        currency: expense.currency,
        amountUsd,
        categoryId: expense.categoryId,
        spaceId,
        source: ExpenseSource.EXCEL,
        createdAt,
      });
    }

    let created = 0;

    if (validData.length > 0) {
      const result = await prisma.expense.createMany({
        data: validData,
      });
      created = result.count;
    }

    return NextResponse.json({ created, errors });
  } catch (error) {
    console.error("Bulk expense creation error:", error);
    return NextResponse.json(
      { error: "Error al crear gastos en lote", created: 0, errors: [] },
      { status: 500 }
    );
  }
});
