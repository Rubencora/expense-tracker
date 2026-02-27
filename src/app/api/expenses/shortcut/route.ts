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

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "expenses/shortcut",
    timestamp: new Date().toISOString(),
    message: "POST to this endpoint with Authorization: Bearer <token> and JSON body { merchant, amount, currency }",
  });
}

export async function POST(req: NextRequest) {
  console.log("[SHORTCUT] Request received:", {
    method: req.method,
    url: req.url,
    hasAuth: !!req.headers.get("authorization"),
    contentType: req.headers.get("content-type"),
    timestamp: new Date().toISOString(),
  });

  try {
    // Auth by API token
    const authResult = await authenticateByApiToken(req);
    if (authResult instanceof NextResponse) {
      console.log("[SHORTCUT] Auth failed - returning", authResult.status);
      return authResult;
    }
    const { userId } = authResult;
    console.log("[SHORTCUT] Auth OK, userId:", userId);

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
    } catch (parseErr) {
      console.error("[SHORTCUT] JSON parse error:", parseErr);
      return NextResponse.json(
        { error: "JSON invalido en el body" },
        { status: 400 }
      );
    }

    console.log("[SHORTCUT] Raw body:", JSON.stringify(body));

    // iOS Shortcuts adds leading/trailing spaces to JSON keys — normalize them
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      normalized[key.trim().toLowerCase()] = value;
    }

    console.log("[SHORTCUT] Normalized:", JSON.stringify(normalized));

    // Lenient extraction
    const merchant = String(normalized.merchant || "").trim();
    const rawAmount = normalized.amount;
    const rawCurrency = normalized.currency;

    console.log("[SHORTCUT] Parsed fields:", { merchant, rawAmount, rawCurrency, typeOfAmount: typeof rawAmount });

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

    // iOS Apple Pay often sends amount=0 because the actual amount
    // isn't available at trigger time (especially credit cards).
    // We accept 0 and create the expense so the user can edit it later.
    const amountIsZero = amount === 0 || isNaN(amount);
    if (amountIsZero) {
      amount = 0;
    }

    console.log("[SHORTCUT] Final parsed:", { amount, currency, amountIsZero });

    if (isNaN(amount) || amount < 0) {
      console.log("[SHORTCUT] Invalid amount, rejecting");
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

    // Convert to USD (0 if amount is 0)
    const amountUsd = amount > 0 ? await convertToUSD(amount, currency) : 0;

    // Create expense - if amount is 0, add note in description
    const expense = await prisma.expense.create({
      data: {
        userId,
        merchant,
        amount,
        currency,
        amountUsd,
        categoryId: classification.categoryId,
        descriptionAi: amountIsZero
          ? `${classification.description || ""} (monto pendiente - editar)`.trim()
          : classification.description,
        spaceId: user?.defaultSpaceId || null,
        source: "SHORTCUT",
      },
      include: {
        category: { select: { name: true, emoji: true } },
      },
    });

    console.log("[SHORTCUT] Created expense:", {
      id: expense.id,
      merchant: expense.merchant,
      amount: expense.amount,
      currency: expense.currency,
      category: expense.category?.name,
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
    console.error("[SHORTCUT] Error:", error);
    return NextResponse.json(
      { error: "Error al registrar el gasto" },
      { status: 500 }
    );
  }
}
