import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const chatSchema = z.object({
  message: z.string().min(1, "El mensaje no puede estar vacio"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

export const POST = authMiddleware(async (req: NextRequest, { userId }) => {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "El servicio de chat no esta disponible en este momento. Contacta al administrador." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const parsed = chatSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, history } = parsed.data;

    // --- Fetch user's financial context ---

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      monthlyExpenses,
      topCategories,
      activeIncomes,
      recentExpenses,
      savingsGoals,
    ] = await Promise.all([
      // Total expenses this month
      prisma.expense.aggregate({
        where: { userId, createdAt: { gte: startOfMonth } },
        _sum: { amountUsd: true },
        _count: true,
      }),

      // Top 5 categories with totals this month
      prisma.expense.groupBy({
        by: ["categoryId"],
        where: { userId, createdAt: { gte: startOfMonth } },
        _sum: { amountUsd: true },
        orderBy: { _sum: { amountUsd: "desc" } },
        take: 5,
      }),

      // Active incomes
      prisma.income.findMany({
        where: { userId, isActive: true },
        select: { amountUsd: true, frequency: true, name: true },
      }),

      // Recent 10 expenses
      prisma.expense.findMany({
        where: { userId },
        select: {
          merchant: true,
          amountUsd: true,
          category: { select: { name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // Active savings goals
      prisma.savingsGoal.findMany({
        where: { userId, isCompleted: false },
        select: {
          name: true,
          targetAmountUsd: true,
          currentAmountUsd: true,
        },
      }),
    ]);

    // Resolve category names for top categories
    const categoryIds = topCategories.map((c) => c.categoryId);
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, emoji: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const topCategoriesFormatted = topCategories
      .map((c) => {
        const cat = categoryMap.get(c.categoryId);
        return cat
          ? `${cat.emoji} ${cat.name}: $${(c._sum.amountUsd ?? 0).toFixed(2)} USD`
          : null;
      })
      .filter(Boolean)
      .join("\n");

    // Calculate total monthly income
    const totalMonthlyIncome = activeIncomes.reduce((sum, inc) => {
      switch (inc.frequency) {
        case "MONTHLY":
          return sum + inc.amountUsd;
        case "WEEKLY":
          return sum + (inc.amountUsd * 52) / 12;
        case "BIWEEKLY":
          return sum + (inc.amountUsd * 26) / 12;
        case "YEARLY":
          return sum + inc.amountUsd / 12;
        case "ONCE":
          return sum;
        default:
          return sum;
      }
    }, 0);

    // Format recent expenses
    const recentExpensesFormatted = recentExpenses
      .map(
        (e) =>
          `- ${e.merchant}: $${e.amountUsd.toFixed(2)} USD (${e.category.name}) - ${e.createdAt.toLocaleDateString("es-CO")}`
      )
      .join("\n");

    // Format savings goals
    const savingsGoalsFormatted =
      savingsGoals.length > 0
        ? savingsGoals
            .map(
              (g) =>
                `- ${g.name}: $${g.currentAmountUsd.toFixed(2)} / $${g.targetAmountUsd.toFixed(2)} USD (${Math.round((g.currentAmountUsd / g.targetAmountUsd) * 100)}%)`
            )
            .join("\n")
        : "No hay metas de ahorro activas.";

    const totalExpensesThisMonth = monthlyExpenses._sum.amountUsd ?? 0;
    const expenseCount = monthlyExpenses._count;
    const remainingBudget = totalMonthlyIncome - totalExpensesThisMonth;

    // --- Build system prompt ---

    const systemPrompt = `Eres un asistente financiero inteligente para una app colombiana de seguimiento de gastos llamada MisGastos. Responde siempre en espanol, de forma concisa y amigable. Usa los datos reales del usuario para dar consejos personalizados.

CONTEXTO FINANCIERO DEL USUARIO (este mes):

Gastos totales del mes: $${totalExpensesThisMonth.toFixed(2)} USD (${expenseCount} transacciones)
Ingreso mensual estimado: $${totalMonthlyIncome.toFixed(2)} USD
Disponible estimado: $${remainingBudget.toFixed(2)} USD

Top categorias de gasto este mes:
${topCategoriesFormatted || "Sin gastos registrados este mes."}

Ultimos gastos:
${recentExpensesFormatted || "Sin gastos recientes."}

Metas de ahorro:
${savingsGoalsFormatted}

INSTRUCCIONES:
- Responde en espanol de forma concisa (maximo 2-3 parrafos).
- Referencia los datos reales del usuario cuando sea relevante.
- Da consejos practicos y personalizados sobre finanzas.
- Si el usuario pregunta algo que no esta relacionado con finanzas, redirigelo amablemente.
- Usa formato simple, sin markdown excesivo.
- Los montos estan en USD para normalizacion interna, pero puedes mencionar que la moneda base es USD.`;

    // --- Call OpenAI ---

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map(
        (h) =>
          ({
            role: h.role,
            content: h.content,
          }) as OpenAI.ChatCompletionMessageParam
      ),
      { role: "user", content: message },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "No pude generar una respuesta. Intenta de nuevo.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Error al procesar el mensaje" },
      { status: 500 }
    );
  }
});
