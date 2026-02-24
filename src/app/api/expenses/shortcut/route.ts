import { NextRequest, NextResponse } from "next/server";
import { authenticateByApiToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCurrency, convertToUSD } from "@/lib/currency";
import { classifyExpense } from "@/lib/ai/classify";

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

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "JSON invalido en el body" },
        { status: 400 }
      );
    }

    // iOS Shortcuts adds leading/trailing spaces to JSON keys — normalize them
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      normalized[key.trim().toLowerCase()] = value;
    }

    // Lenient extraction
    const merchant = String(normalized.merchant || "").trim();
    const rawAmount = normalized.amount;
    const rawCurrency = normalized.currency;

    if (!merchant) {
      return NextResponse.json(
        { error: "Datos invalidos", details: "merchant es requerido" },
        { status: 400 }
      );
    }

    if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
      return NextResponse.json(
        { error: "Datos invalidos", details: "amount es requerido" },
        { status: 400 }
      );
    }

    let amount: number;
    let currency: "COP" | "USD";

    // Parse amount and currency - handle any type iOS may send
    const currencyUpper = rawCurrency ? String(rawCurrency).toUpperCase().trim() : null;
    if (currencyUpper === "COP" || currencyUpper === "USD") {
      amount = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount).replace(/[^0-9.\-]/g, ""));
      currency = currencyUpper;
    } else {
      const amountStr = String(rawAmount).replace(/[^0-9.\-]/g, "");
      const parsedCurrency = parseCurrency(amountStr);
      amount = parsedCurrency.amount;
      currency = parsedCurrency.currency;
    }

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Datos invalidos", details: `amount invalido: ${String(rawAmount)}` },
        { status: 400 }
      );
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
