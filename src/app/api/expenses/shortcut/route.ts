import { NextRequest, NextResponse } from "next/server";
import { authenticateByApiToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";
import { classifyExpense } from "@/lib/ai/classify";
import { requestAmountViaTelegram } from "@/lib/telegram/bot";
import { sendPushNotification } from "@/lib/push";
import { parseShortcutPayload, type Currency } from "@/lib/shortcut-parse";
import type { Prisma } from "@/generated/prisma/client";

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;
const FALLBACK_MERCHANT = "Compra con tarjeta";

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

/** Every request is persisted so the shortcut can be diagnosed without container logs. */
async function logEvent(
  userId: string,
  rawBody: unknown,
  data: {
    status: string;
    parsedMerchant?: string | null;
    parsedAmount?: number | null;
    parsedCurrency?: string | null;
    amountSource?: string | null;
    expenseId?: string | null;
  }
): Promise<void> {
  try {
    await prisma.shortcutEvent.create({
      data: {
        userId,
        rawBody: (rawBody ?? null) as Prisma.InputJsonValue,
        status: data.status,
        parsedMerchant: data.parsedMerchant ?? null,
        parsedAmount: data.parsedAmount ?? null,
        parsedCurrency: data.parsedCurrency ?? null,
        amountSource: data.amountSource ?? null,
        expenseId: data.expenseId ?? null,
      },
    });
  } catch (error) {
    console.error("[SHORTCUT] Could not log event:", error);
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "expenses/shortcut",
    timestamp: new Date().toISOString(),
    message:
      "POST to this endpoint with Authorization: Bearer <token> and JSON body { merchant, amount, currency }. " +
      "amount may be a number or text like \"$12.34\", \"45.000\", \"US$ 12,34\"; nested { amount, currencyCode } objects are accepted too.",
  });
}

export async function POST(req: NextRequest) {
  console.log("[SHORTCUT] Request received:", {
    hasAuth: !!req.headers.get("authorization"),
    contentType: req.headers.get("content-type"),
    timestamp: new Date().toISOString(),
  });

  try {
    const authResult = await authenticateByApiToken(req);
    if (authResult instanceof NextResponse) {
      console.log("[SHORTCUT] Auth failed - returning", authResult.status);
      return authResult;
    }
    const { userId } = authResult;

    const token = req.headers.get("authorization")?.slice(7) || "";
    if (!checkRateLimit(token)) {
      return NextResponse.json(
        { error: "Limite de solicitudes excedido. Intenta en un minuto." },
        { status: 429 }
      );
    }

    // Read the body as text first so that even malformed JSON gets logged.
    const rawText = await req.text();
    let body: unknown;
    try {
      body = rawText.trim() ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      console.error("[SHORTCUT] JSON parse error:", parseErr);
      await logEvent(userId, { _rawText: rawText.slice(0, 2000) }, { status: "invalid_json" });
      return NextResponse.json({ error: "JSON invalido en el body" }, { status: 400 });
    }
    console.log("[SHORTCUT] Raw body:", rawText.slice(0, 2000));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { defaultSpaceId: true, defaultCurrency: true },
    });
    const defaultCurrency: Currency = user?.defaultCurrency === "USD" ? "USD" : "COP";

    const parsed = parseShortcutPayload(body, defaultCurrency);
    console.log("[SHORTCUT] Parsed:", JSON.stringify(parsed));

    // Never lose a purchase: fall back to a generic merchant instead of rejecting.
    const merchant = parsed.merchant || FALLBACK_MERCHANT;
    const amount = Number.isFinite(parsed.amount) ? parsed.amount : 0;
    const currency = parsed.currency;
    const amountIsZero = amount <= 0;

    const categories = await prisma.category.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, emoji: true },
    });

    const classification = await classifyExpense(merchant, categories);
    const amountUsd = amountIsZero ? 0 : await convertToUSD(amount, currency);

    const expense = await prisma.expense.create({
      data: {
        userId,
        merchant,
        amount: amountIsZero ? 0 : amount,
        currency,
        amountUsd,
        categoryId: classification.categoryId,
        descriptionAi: amountIsZero
          ? `${classification.description || ""} (monto pendiente)`.trim()
          : classification.description,
        spaceId: user?.defaultSpaceId || null,
        source: "SHORTCUT",
      },
      include: { category: { select: { name: true, emoji: true } } },
    });

    await logEvent(userId, body, {
      status: amountIsZero ? "created_pending_amount" : "created",
      parsedMerchant: merchant,
      parsedAmount: amount,
      parsedCurrency: currency,
      amountSource: parsed.amountSource,
      expenseId: expense.id,
    });

    console.log("[SHORTCUT] Created expense:", {
      id: expense.id,
      merchant: expense.merchant,
      amount: expense.amount,
      currency: expense.currency,
      amountSource: parsed.amountSource,
    });

    if (amountIsZero) {
      // Ask for the real amount through every channel the user has linked.
      requestAmountViaTelegram(userId, expense.id, merchant, currency).catch((err) =>
        console.error("[SHORTCUT] Telegram notification error:", err)
      );
      sendPushNotification(userId, {
        title: "Gasto sin monto",
        body: `${merchant}: toca para ingresar el valor`,
        tag: `pending-amount-${expense.id}`,
        url: "/gastos?pendientes=1",
      }).catch((err) => console.error("[SHORTCUT] Push notification error:", err));
    }

    return NextResponse.json(
      {
        success: true,
        pendingAmount: amountIsZero,
        parsed: { amountSource: parsed.amountSource, currencySource: parsed.currencySource },
        expense: {
          id: expense.id,
          merchant: expense.merchant,
          amount: expense.amount,
          currency: expense.currency,
          amountUsd: expense.amountUsd,
          category: expense.category,
          descriptionAi: expense.descriptionAi,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[SHORTCUT] Error:", error);
    return NextResponse.json({ error: "Error al registrar el gasto" }, { status: 500 });
  }
}
