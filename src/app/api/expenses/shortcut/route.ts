import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateByApiToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCurrency, convertToUSD } from "@/lib/currency";
import { classifyExpense } from "@/lib/ai/classify";

const shortcutSchema = z.object({
  merchant: z.string().min(1, "Comercio requerido"),
  amount: z.union([z.number(), z.string()]),
  currency: z.enum(["COP", "USD"]).optional(),
});

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(token);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(token, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;

  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // Auth by API token
    const authResult = await authenticateByApiToken(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // Rate limit
    const token = req.headers.get("authorization")?.slice(7) || "";
    if (!checkRateLimit(token)) {
      return NextResponse.json(
        { error: "Limite de solicitudes excedido. Intenta en un minuto." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = shortcutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { merchant } = parsed.data;
    let amount: number;
    let currency: "COP" | "USD";

    // Parse amount and currency
    if (parsed.data.currency) {
      amount = typeof parsed.data.amount === "string"
        ? parseFloat(parsed.data.amount)
        : parsed.data.amount;
      currency = parsed.data.currency;
    } else {
      const amountStr = String(parsed.data.amount);
      const parsedCurrency = parseCurrency(amountStr);
      amount = parsedCurrency.amount;
      currency = parsedCurrency.currency;
    }

    // Get user's categories and default space
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { defaultSpaceId: true },
    });

    const categories = await prisma.category.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, emoji: true },
    });

    // Classify with AI
    const classification = await classifyExpense(merchant, categories);

    // Convert to USD
    const amountUsd = await convertToUSD(amount, currency);

    // Create expense
    const expense = await prisma.expense.create({
      data: {
        userId,
        merchant,
        amount,
        currency,
        amountUsd,
        categoryId: classification.categoryId,
        descriptionAi: classification.description,
        spaceId: user?.defaultSpaceId || null,
        source: "SHORTCUT",
      },
      include: {
        category: { select: { name: true, emoji: true } },
      },
    });

    return NextResponse.json({
      success: true,
      expense: {
        id: expense.id,
        merchant: expense.merchant,
        amount: expense.amount,
        currency: expense.currency,
        amountUsd: expense.amountUsd,
        category: expense.category,
        descriptionAi: expense.descriptionAi,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Shortcut expense error:", error);
    return NextResponse.json(
      { error: "Error al registrar el gasto" },
      { status: 500 }
    );
  }
}
