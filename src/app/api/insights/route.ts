import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IncomeFrequency } from "@/generated/prisma/client";

function getMonthlyMultiplier(frequency: IncomeFrequency): number {
  switch (frequency) {
    case "ONCE":
      return 0;
    case "WEEKLY":
      return 4.33;
    case "BIWEEKLY":
      return 2.17;
    case "MONTHLY":
      return 1;
    case "YEARLY":
      return 1 / 12;
    default:
      return 0;
  }
}

export const GET = authMiddleware(async (_req: NextRequest, { userId }) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Current month expenses
    const currentExpenses = await prisma.expense.findMany({
      where: {
        userId,
        createdAt: { gte: currentMonthStart },
      },
      include: {
        category: { select: { name: true, emoji: true } },
      },
    });

    const currentTotal = currentExpenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const currentCount = currentExpenses.length;

    // Top 3 categories with amounts
    const categoryMap = new Map<string, { name: string; emoji: string; total: number }>();
    for (const e of currentExpenses) {
      const key = e.category.name;
      const existing = categoryMap.get(key);
      if (existing) {
        existing.total += e.amountUsd;
      } else {
        categoryMap.set(key, {
          name: e.category.name,
          emoji: e.category.emoji,
          total: e.amountUsd,
        });
      }
    }
    const topCategories = Array.from(categoryMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // Last month expenses
    const lastExpenses = await prisma.expense.findMany({
      where: {
        userId,
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
      select: { amountUsd: true },
    });

    const lastTotal = lastExpenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const lastCount = lastExpenses.length;

    // Monthly income from active incomes
    const incomes = await prisma.income.findMany({
      where: { userId, isActive: true },
      select: { amountUsd: true, frequency: true },
    });

    const monthlyIncome = incomes.reduce((sum, inc) => {
      return sum + inc.amountUsd * getMonthlyMultiplier(inc.frequency);
    }, 0);

    // Savings goals progress
    const savingsGoals = await prisma.savingsGoal.findMany({
      where: { userId, isCompleted: false },
      select: {
        name: true,
        icon: true,
        targetAmountUsd: true,
        currentAmountUsd: true,
      },
    });

    // Try AI-powered insights
    if (process.env.OPENAI_API_KEY) {
      try {
        const client = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const topCatSummary = topCategories
          .map((c) => `${c.emoji} ${c.name}: $${c.total.toFixed(2)} USD`)
          .join(", ");

        const goalsSummary = savingsGoals
          .map((g) => {
            const pct = g.targetAmountUsd > 0
              ? Math.round((g.currentAmountUsd / g.targetAmountUsd) * 100)
              : 0;
            return `${g.icon} ${g.name}: ${pct}% completado ($${g.currentAmountUsd.toFixed(2)}/$${g.targetAmountUsd.toFixed(2)})`;
          })
          .join(", ");

        const prompt = `Eres un asistente financiero. Genera 2-3 insights breves y narrativos en espanol sobre las finanzas del usuario. Usa tono amigable y directo.

Datos del mes actual:
- Gastos totales: $${currentTotal.toFixed(2)} USD (${currentCount} transacciones)
- Top categorias: ${topCatSummary || "Sin gastos aun"}

Mes pasado:
- Gastos totales: $${lastTotal.toFixed(2)} USD (${lastCount} transacciones)

Ingreso mensual estimado: $${monthlyIncome.toFixed(2)} USD
Metas de ahorro activas: ${goalsSummary || "Ninguna"}

Ejemplos de estilo: "Gastaste 25% mas que el mes pasado", "Tu categoria principal es Comida con $X", "Llevas 60% de tu meta de Vacaciones".

Responde SOLO con un JSON valido: un array de strings. Ejemplo: ["insight 1", "insight 2", "insight 3"]`;

        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 400,
          messages: [
            { role: "user", content: prompt },
          ],
        });

        const text = response.choices[0]?.message?.content || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.every((i) => typeof i === "string")) {
            return NextResponse.json({ insights: parsed });
          }
        }
      } catch (aiError) {
        console.error("AI insights error:", aiError);
        // Fall through to basic insights
      }
    }

    // Basic computed insights (no AI)
    const insights: string[] = [];

    // Month-over-month comparison
    if (lastTotal > 0 && currentTotal > 0) {
      const changePercent = Math.round(((currentTotal - lastTotal) / lastTotal) * 100);
      if (changePercent > 0) {
        insights.push(`Llevas un ${changePercent}% mas de gasto que el mes pasado ($${currentTotal.toFixed(2)} vs $${lastTotal.toFixed(2)} USD)`);
      } else if (changePercent < 0) {
        insights.push(`Vas gastando ${Math.abs(changePercent)}% menos que el mes pasado. Buen ritmo!`);
      } else {
        insights.push(`Tus gastos van al mismo nivel que el mes pasado ($${currentTotal.toFixed(2)} USD)`);
      }
    } else if (currentTotal > 0) {
      insights.push(`Este mes llevas $${currentTotal.toFixed(2)} USD en ${currentCount} transacciones`);
    }

    // Top category insight
    if (topCategories.length > 0) {
      const top = topCategories[0];
      insights.push(`Tu categoria principal es ${top.emoji} ${top.name} con $${top.total.toFixed(2)} USD`);
    }

    // Savings goals progress
    if (savingsGoals.length > 0) {
      const goal = savingsGoals[0];
      const pct = goal.targetAmountUsd > 0
        ? Math.round((goal.currentAmountUsd / goal.targetAmountUsd) * 100)
        : 0;
      insights.push(`Llevas ${pct}% de tu meta "${goal.name}" ($${goal.currentAmountUsd.toFixed(2)} de $${goal.targetAmountUsd.toFixed(2)} USD)`);
    }

    // Income vs expenses
    if (monthlyIncome > 0 && currentTotal > 0) {
      const ratio = Math.round((currentTotal / monthlyIncome) * 100);
      insights.push(`Has gastado el ${ratio}% de tu ingreso mensual estimado`);
    }

    return NextResponse.json({ insights: insights.slice(0, 3) });
  } catch (error) {
    console.error("Insights error:", error);
    return NextResponse.json(
      { error: "Error al generar insights" },
      { status: 500 }
    );
  }
});
