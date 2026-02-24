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
    const midMonth = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59, 999);

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

    // Weekly trend: first half vs second half of month
    const firstHalfExpenses = currentExpenses.filter((e) => new Date(e.createdAt) <= midMonth);
    const secondHalfExpenses = currentExpenses.filter((e) => new Date(e.createdAt) > midMonth);
    const firstHalfTotal = firstHalfExpenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const secondHalfTotal = secondHalfExpenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const dayOfMonth = now.getDate();
    const isSecondHalf = dayOfMonth > 15;

    // Anomaly detection: single expense > 30% of total
    const anomalies = currentExpenses.filter(
      (e) => currentTotal > 0 && e.amountUsd / currentTotal > 0.3
    );

    // Top categories with amounts
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
      .slice(0, 5);

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

    // Budgets with spending
    const budgets = await prisma.budget.findMany({
      where: { userId },
      include: { category: { select: { name: true, emoji: true } } },
    });

    const budgetUtilization = budgets.map((b) => {
      const spent = currentExpenses
        .filter((e) => e.category.name === b.category.name)
        .reduce((sum, e) => sum + e.amountUsd, 0);
      const pct = b.monthlyLimitUsd > 0 ? Math.round((spent / b.monthlyLimitUsd) * 100) : 0;
      return {
        emoji: b.category.emoji,
        name: b.category.name,
        limit: b.monthlyLimitUsd,
        spent,
        pct,
        overBudget: spent > b.monthlyLimitUsd,
      };
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

        const budgetSummary = budgetUtilization.length > 0
          ? budgetUtilization
              .map((b) => `${b.emoji} ${b.name}: $${b.spent.toFixed(2)}/$${b.limit.toFixed(2)} USD (${b.pct}%${b.overBudget ? " - EXCEDIDO" : ""})`)
              .join(", ")
          : "Sin presupuestos configurados";

        const anomalySummary = anomalies.length > 0
          ? anomalies
              .map((a) => `"${a.merchant}" por $${a.amountUsd.toFixed(2)} USD (${currentTotal > 0 ? Math.round((a.amountUsd / currentTotal) * 100) : 0}% del total)`)
              .join(", ")
          : "Ninguno";

        const weeklyTrendSummary = isSecondHalf
          ? `Primera quincena: $${firstHalfTotal.toFixed(2)} USD, Segunda quincena (hasta hoy): $${secondHalfTotal.toFixed(2)} USD`
          : `Primera quincena (hasta hoy): $${firstHalfTotal.toFixed(2)} USD`;

        const prompt = `Eres un coach financiero personal. Tu tono es el de un amigo cercano que entiende de finanzas: motivador pero honesto, celebras los logros y das alertas claras cuando algo no va bien. Genera exactamente 4 insights en espanol. Cada insight debe ser breve (1-2 oraciones), personalizado y accionable.

Contexto del usuario:

MES ACTUAL (dia ${dayOfMonth} del mes):
- Gastos totales: $${currentTotal.toFixed(2)} USD (${currentCount} transacciones)
- Top categorias: ${topCatSummary || "Sin gastos aun"}
- Ritmo quincenal: ${weeklyTrendSummary}

MES PASADO:
- Gastos totales: $${lastTotal.toFixed(2)} USD (${lastCount} transacciones)

INGRESO MENSUAL: $${monthlyIncome.toFixed(2)} USD
PRESUPUESTOS: ${budgetSummary}
METAS DE AHORRO: ${goalsSummary || "Ninguna configurada"}
GASTOS ANOMALOS (>30% del total): ${anomalySummary}

Directrices para los insights:
1. Compara el ritmo de gasto actual vs mes pasado (ritmo proporcional al dia del mes, no total vs total)
2. Si hay presupuestos, menciona cuales van bien y cuales necesitan atencion
3. Si hay anomalias, da un callout especifico sobre ese gasto grande
4. Si hay metas de ahorro, motiva o alerta sobre el progreso
5. Si el ritmo quincenal muestra aceleracion o desaceleracion, mencionalo
6. Usa emojis moderadamente para dar personalidad

Responde SOLO con un JSON valido: un array de exactamente 4 strings. Ejemplo: ["insight 1", "insight 2", "insight 3", "insight 4"]`;

        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 600,
          messages: [
            { role: "user", content: prompt },
          ],
        });

        const text = response.choices[0]?.message?.content || "";
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.every((i) => typeof i === "string")) {
            return NextResponse.json({ insights: parsed.slice(0, 4) });
          }
        }
      } catch (aiError) {
        console.error("AI insights error:", aiError);
        // Fall through to basic insights
      }
    }

    // Basic computed insights (no AI)
    const insights: string[] = [];

    // Month-over-month comparison (pace-adjusted)
    if (lastTotal > 0 && currentTotal > 0) {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const projectedTotal = (currentTotal / dayOfMonth) * daysInMonth;
      const projectedChange = Math.round(((projectedTotal - lastTotal) / lastTotal) * 100);
      if (projectedChange > 10) {
        insights.push(`Al ritmo actual, cerrarás el mes ~${projectedChange}% por encima del mes pasado. Momento de ajustar el paso.`);
      } else if (projectedChange < -10) {
        insights.push(`Vas gastando menos que el mes pasado al mismo punto. Buen control!`);
      } else {
        insights.push(`Tu ritmo de gasto va parejo al mes pasado ($${currentTotal.toFixed(2)} USD hasta hoy).`);
      }
    } else if (currentTotal > 0) {
      insights.push(`Este mes llevas $${currentTotal.toFixed(2)} USD en ${currentCount} transacciones.`);
    }

    // Budget utilization insight
    const overBudget = budgetUtilization.filter((b) => b.overBudget);
    if (overBudget.length > 0) {
      const names = overBudget.map((b) => `${b.emoji} ${b.name} (${b.pct}%)`).join(", ");
      insights.push(`Alerta: presupuesto excedido en ${names}. Revisa esos gastos.`);
    } else if (budgetUtilization.length > 0) {
      const highest = budgetUtilization.sort((a, b) => b.pct - a.pct)[0];
      insights.push(`Tu presupuesto mas usado es ${highest.emoji} ${highest.name} al ${highest.pct}%. Vas bien.`);
    }

    // Anomaly callout
    if (anomalies.length > 0) {
      const biggest = anomalies.sort((a, b) => b.amountUsd - a.amountUsd)[0];
      const pct = currentTotal > 0 ? Math.round((biggest.amountUsd / currentTotal) * 100) : 0;
      insights.push(`Ojo: "${biggest.merchant}" representa el ${pct}% de tu gasto total este mes ($${biggest.amountUsd.toFixed(2)} USD).`);
    }

    // Top category insight
    if (topCategories.length > 0) {
      const top = topCategories[0];
      insights.push(`Tu categoria principal es ${top.emoji} ${top.name} con $${top.total.toFixed(2)} USD.`);
    }

    // Savings goals progress
    if (savingsGoals.length > 0) {
      const goal = savingsGoals[0];
      const pct = goal.targetAmountUsd > 0
        ? Math.round((goal.currentAmountUsd / goal.targetAmountUsd) * 100)
        : 0;
      if (pct >= 75) {
        insights.push(`Casi llegas! Tu meta "${goal.name}" va al ${pct}%. Un empujon mas!`);
      } else {
        insights.push(`Tu meta "${goal.name}" va al ${pct}% ($${goal.currentAmountUsd.toFixed(2)} de $${goal.targetAmountUsd.toFixed(2)} USD).`);
      }
    }

    // Income vs expenses
    if (monthlyIncome > 0 && currentTotal > 0) {
      const ratio = Math.round((currentTotal / monthlyIncome) * 100);
      insights.push(`Has usado el ${ratio}% de tu ingreso mensual. ${ratio > 80 ? "Cuidado con el cierre de mes." : "Buen margen todavia."}`);
    }

    return NextResponse.json({ insights: insights.slice(0, 4) });
  } catch (error) {
    console.error("Insights error:", error);
    return NextResponse.json(
      { error: "Error al generar insights" },
      { status: 500 }
    );
  }
});
