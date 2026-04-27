import { Bot, InlineKeyboard, Context } from "grammy";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { convertToUSD } from "@/lib/currency";
import { classifyExpense } from "@/lib/ai/classify";

// Pending expenses waiting for confirmation
const pendingExpenses = new Map<
  string,
  {
    userId: string;
    merchant: string;
    amount: number;
    currency: "COP" | "USD";
    amountUsd: number;
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
    description: string;
  }
>();

// Pending amount requests: expenses created with amount=0 waiting for real amount via Telegram
const pendingAmountRequests = new Map<
  string, // chatId
  { expenseId: string; merchant: string; currency: "COP" | "USD" }
>();

export async function generateLinkingCode(userId: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await prisma.user.update({
    where: { id: userId },
    data: { telegramLinkCode: code, telegramLinkCodeExp: expiresAt },
  });
  return code;
}

// --- Helpers ---

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCOP(n: number): string {
  return n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function progressBar(percent: number, length = 10): string {
  const filled = Math.min(Math.round((percent / 100) * length), length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

function getMonthDates() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dayOfMonth = now.getDate();
  const daysInMonth = endOfMonth.getDate();
  return { now, startOfMonth, dayOfMonth, daysInMonth };
}

function getLastMonthDates() {
  const now = new Date();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  return { startOfLastMonth, endOfLastMonth };
}

function createBot(): Bot {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

  // /start command
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 Hola! Soy tu asistente de gastos.\n\n" +
        "Para vincular tu cuenta, envia tu codigo de 6 digitos desde Configuracion en la app.\n\n" +
        "Envia /ayuda para ver todos los comandos."
    );
  });

  // /ayuda command
  bot.command("ayuda", async (ctx) => {
    await ctx.reply(
      "📋 *Comandos disponibles:*\n\n" +
        "💬 *Registrar gasto:*\n" +
        "Envia un texto como:\n" +
        "`Almuerzo Crepes 35000`\n" +
        "`Uber 15.50 USD`\n\n" +
        "📊 *Reportes:*\n" +
        "/resumen - Resumen completo del mes\n" +
        "/hoy - Gastos de hoy\n" +
        "/semana - Resumen semanal\n" +
        "/categorias - Desglose por categoria\n\n" +
        "📈 *Analisis:*\n" +
        "/presupuesto - Estado de presupuestos\n" +
        "/top - Top 5 comercios del mes\n" +
        "/comparar - Comparar con mes anterior\n\n" +
        "🤖 *Chat IA:*\n" +
        "/chat _pregunta_ - Pregunta sobre tus finanzas\n" +
        "O envia una pregunta con ? (ej: ¿cuanto gaste hoy?)\n\n" +
        "🔍 *Busqueda:*\n" +
        "/buscar _texto_ - Buscar gastos por comercio\n\n" +
        "/ayuda - Este mensaje",
      { parse_mode: "Markdown" }
    );
  });

  // /resumen and /mes - Enhanced monthly summary
  bot.command(["resumen", "mes"], async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const { startOfMonth, dayOfMonth, daysInMonth } = getMonthDates();

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
      include: { category: true },
      orderBy: { amountUsd: "desc" },
    });

    if (expenses.length === 0) {
      return ctx.reply("No tienes gastos registrados este mes.");
    }

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const avgDaily = total / dayOfMonth;
    const projection = avgDaily * daysInMonth;

    // Category breakdown
    const categoryTotals = new Map<string, { name: string; emoji: string; total: number; count: number }>();
    for (const e of expenses) {
      const existing = categoryTotals.get(e.category.id);
      if (existing) {
        existing.total += e.amountUsd;
        existing.count++;
      } else {
        categoryTotals.set(e.category.id, {
          name: e.category.name,
          emoji: e.category.emoji,
          total: e.amountUsd,
          count: 1,
        });
      }
    }

    const sortedCategories = Array.from(categoryTotals.values()).sort((a, b) => b.total - a.total);

    // Biggest expense
    const biggest = expenses[0];

    let msg = `📊 *Resumen del mes* (dia ${dayOfMonth}/${daysInMonth})\n\n`;
    msg += `💰 Total: *$${fmt(total)} USD*\n`;
    msg += `📝 Gastos: ${expenses.length}\n`;
    msg += `📅 Promedio diario: $${fmt(avgDaily)} USD\n`;
    msg += `🔮 Proyeccion mes: $${fmt(projection)} USD\n`;
    msg += `\n🏆 Mayor gasto: ${biggest.category.emoji} ${biggest.merchant} ($${fmt(biggest.amountUsd)})\n`;

    msg += "\n📂 *Por categoria:*\n";
    sortedCategories.forEach((c) => {
      const pct = ((c.total / total) * 100).toFixed(0);
      msg += `${c.emoji} ${c.name}: $${fmt(c.total)} (${pct}%) - ${c.count} gastos\n`;
    });

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /hoy - Enhanced today's expenses
  bot.command("hoy", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: startOfDay } },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    });

    if (expenses.length === 0) {
      return ctx.reply("✨ No tienes gastos registrados hoy.");
    }

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);

    // Group by category
    const byCategory = new Map<string, { emoji: string; name: string; items: typeof expenses }>();
    for (const e of expenses) {
      const existing = byCategory.get(e.category.id);
      if (existing) {
        existing.items.push(e);
      } else {
        byCategory.set(e.category.id, {
          emoji: e.category.emoji,
          name: e.category.name,
          items: [e],
        });
      }
    }

    let msg = `📅 *Gastos de hoy* - $${fmt(total)} USD (${expenses.length} gastos)\n\n`;
    for (const [, cat] of byCategory) {
      const catTotal = cat.items.reduce((sum, e) => sum + e.amountUsd, 0);
      msg += `${cat.emoji} *${cat.name}* ($${fmt(catTotal)})\n`;
      cat.items.forEach((e) => {
        const original = e.currency === "COP" ? `$${fmtCOP(e.amount)} COP` : `$${fmt(e.amount)} USD`;
        msg += `  • ${e.merchant} - ${original}\n`;
      });
      msg += "\n";
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /semana - Enhanced weekly summary
  bot.command("semana", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: weekAgo } },
      include: { category: true },
    });

    if (expenses.length === 0) {
      return ctx.reply("✨ No tienes gastos en los ultimos 7 dias.");
    }

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const avgDaily = total / 7;

    // Daily breakdown
    const dailyTotals = new Map<string, number>();
    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    for (const e of expenses) {
      const day = e.createdAt.toISOString().split("T")[0];
      dailyTotals.set(day, (dailyTotals.get(day) || 0) + e.amountUsd);
    }

    // Category breakdown
    const categoryTotals = new Map<string, { name: string; emoji: string; total: number }>();
    for (const e of expenses) {
      const existing = categoryTotals.get(e.category.id);
      if (existing) {
        existing.total += e.amountUsd;
      } else {
        categoryTotals.set(e.category.id, {
          name: e.category.name,
          emoji: e.category.emoji,
          total: e.amountUsd,
        });
      }
    }

    const topCategories = Array.from(categoryTotals.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    let msg = `📆 *Resumen semanal* (ultimos 7 dias)\n\n`;
    msg += `💰 Total: *$${fmt(total)} USD*\n`;
    msg += `📝 Gastos: ${expenses.length}\n`;
    msg += `📅 Promedio diario: $${fmt(avgDaily)} USD\n\n`;

    // Daily chart
    msg += `📊 *Por dia:*\n`;
    const sortedDays = Array.from(dailyTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const maxDaily = Math.max(...sortedDays.map(([, v]) => v));
    for (const [date, dayTotal] of sortedDays) {
      const d = new Date(date + "T12:00:00");
      const dayName = dayNames[d.getDay()];
      const bar = progressBar((dayTotal / maxDaily) * 100, 8);
      msg += `${dayName}: ${bar} $${fmt(dayTotal)}\n`;
    }

    msg += `\n📂 *Top categorias:*\n`;
    topCategories.forEach((c) => {
      msg += `${c.emoji} ${c.name}: $${fmt(c.total)}\n`;
    });

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /categorias - Spending by category this month
  bot.command("categorias", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const { startOfMonth } = getMonthDates();

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
      include: { category: true },
    });

    const categories = await prisma.category.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);

    // Aggregate by category
    const catSpend = new Map<string, number>();
    const catCount = new Map<string, number>();
    for (const e of expenses) {
      catSpend.set(e.categoryId, (catSpend.get(e.categoryId) || 0) + e.amountUsd);
      catCount.set(e.categoryId, (catCount.get(e.categoryId) || 0) + 1);
    }

    let msg = `📂 *Gastos por categoria* (este mes)\n\n`;
    msg += `💰 Total: *$${fmt(total)} USD*\n\n`;

    const sorted = categories
      .map((c) => ({ ...c, spent: catSpend.get(c.id) || 0, count: catCount.get(c.id) || 0 }))
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent);

    if (sorted.length === 0) {
      msg += "No hay gastos este mes.";
    } else {
      const maxSpend = sorted[0].spent;
      sorted.forEach((c) => {
        const pct = total > 0 ? ((c.spent / total) * 100).toFixed(0) : "0";
        const bar = progressBar((c.spent / maxSpend) * 100, 8);
        msg += `${c.emoji} *${c.name}*\n`;
        msg += `${bar} $${fmt(c.spent)} (${pct}%) - ${c.count} gastos\n\n`;
      });
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /presupuesto - Budget progress
  bot.command("presupuesto", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const { startOfMonth, dayOfMonth, daysInMonth } = getMonthDates();

    const budgets = await prisma.budget.findMany({
      where: { userId: user.id },
      include: { category: true },
    });

    if (budgets.length === 0) {
      return ctx.reply("No tienes presupuestos configurados. Puedes crearlos desde la app web.");
    }

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
      select: { categoryId: true, amountUsd: true },
    });

    const catSpend = new Map<string, number>();
    for (const e of expenses) {
      catSpend.set(e.categoryId, (catSpend.get(e.categoryId) || 0) + e.amountUsd);
    }

    const expectedPct = (dayOfMonth / daysInMonth) * 100;

    let msg = `💳 *Presupuestos del mes* (dia ${dayOfMonth}/${daysInMonth})\n\n`;

    budgets.forEach((b) => {
      const spent = catSpend.get(b.categoryId) || 0;
      const pct = (spent / b.monthlyLimitUsd) * 100;
      const remaining = Math.max(b.monthlyLimitUsd - spent, 0);
      const bar = progressBar(pct);

      let status = "✅";
      if (pct >= 100) status = "🔴";
      else if (pct >= expectedPct) status = "⚠️";

      msg += `${b.category.emoji} *${b.category.name}*\n`;
      msg += `${bar} ${pct.toFixed(0)}%\n`;
      msg += `${status} $${fmt(spent)} / $${fmt(b.monthlyLimitUsd)} USD`;
      if (remaining > 0) {
        msg += ` (quedan $${fmt(remaining)})`;
      } else {
        msg += ` (excedido $${fmt(spent - b.monthlyLimitUsd)})`;
      }
      msg += "\n\n";
    });

    msg += `📅 Progreso esperado: ${expectedPct.toFixed(0)}% del mes`;

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /top - Top merchants this month
  bot.command("top", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const { startOfMonth } = getMonthDates();

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
      include: { category: true },
    });

    if (expenses.length === 0) {
      return ctx.reply("No tienes gastos registrados este mes.");
    }

    // Aggregate by merchant
    const merchants = new Map<string, { total: number; count: number; emoji: string }>();
    for (const e of expenses) {
      const key = e.merchant.toLowerCase();
      const existing = merchants.get(key);
      if (existing) {
        existing.total += e.amountUsd;
        existing.count++;
      } else {
        merchants.set(key, { total: e.amountUsd, count: 1, emoji: e.category.emoji });
      }
    }

    const top = Array.from(merchants.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);

    let msg = `🏪 *Top comercios del mes*\n\n`;
    top.forEach(([name, data], i) => {
      const pct = ((data.total / total) * 100).toFixed(0);
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      msg += `${medal} ${data.emoji} *${name}*\n`;
      msg += `   $${fmt(data.total)} USD (${pct}%) - ${data.count} visitas\n\n`;
    });

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /comparar - Compare current vs last month
  bot.command("comparar", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const { startOfMonth } = getMonthDates();
    const { startOfLastMonth, endOfLastMonth } = getLastMonthDates();

    const [currentExpenses, lastExpenses] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: user.id, createdAt: { gte: startOfMonth } },
        include: { category: true },
      }),
      prisma.expense.findMany({
        where: { userId: user.id, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        include: { category: true },
      }),
    ]);

    const currentTotal = currentExpenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const lastTotal = lastExpenses.reduce((sum, e) => sum + e.amountUsd, 0);

    const diff = currentTotal - lastTotal;
    const diffPct = lastTotal > 0 ? ((diff / lastTotal) * 100).toFixed(0) : "N/A";
    const arrow = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";

    // Category comparison
    const catCurrent = new Map<string, { name: string; emoji: string; total: number }>();
    const catLast = new Map<string, { name: string; emoji: string; total: number }>();

    for (const e of currentExpenses) {
      const existing = catCurrent.get(e.category.id);
      if (existing) existing.total += e.amountUsd;
      else catCurrent.set(e.category.id, { name: e.category.name, emoji: e.category.emoji, total: e.amountUsd });
    }
    for (const e of lastExpenses) {
      const existing = catLast.get(e.category.id);
      if (existing) existing.total += e.amountUsd;
      else catLast.set(e.category.id, { name: e.category.name, emoji: e.category.emoji, total: e.amountUsd });
    }

    const allCatIds = new Set([...catCurrent.keys(), ...catLast.keys()]);

    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const now = new Date();
    const currentMonthName = monthNames[now.getMonth()];
    const lastMonthName = monthNames[now.getMonth() - 1] || "Dic";

    let msg = `🔄 *${lastMonthName} vs ${currentMonthName}*\n\n`;
    msg += `${lastMonthName}: $${fmt(lastTotal)} USD (${lastExpenses.length} gastos)\n`;
    msg += `${currentMonthName}: *$${fmt(currentTotal)} USD* (${currentExpenses.length} gastos)\n`;
    msg += `${arrow} Diferencia: $${fmt(Math.abs(diff))} (${diff > 0 ? "+" : ""}${diffPct}%)\n\n`;

    msg += `📂 *Por categoria:*\n`;
    const catComparison = Array.from(allCatIds).map((id) => {
      const curr = catCurrent.get(id);
      const last = catLast.get(id);
      return {
        name: curr?.name || last?.name || "",
        emoji: curr?.emoji || last?.emoji || "",
        current: curr?.total || 0,
        last: last?.total || 0,
      };
    }).sort((a, b) => b.current - a.current);

    catComparison.forEach((c) => {
      const catDiff = c.current - c.last;
      const catArrow = catDiff > 0 ? "↑" : catDiff < 0 ? "↓" : "=";
      msg += `${c.emoji} ${c.name}: $${fmt(c.last)} → $${fmt(c.current)} ${catArrow}\n`;
    });

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /buscar - Search expenses by merchant
  bot.command("buscar", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const query = ctx.message?.text?.replace(/^\/buscar\s*/i, "").trim();
    if (!query) {
      return ctx.reply("Uso: /buscar _nombre del comercio_\nEjemplo: `/buscar uber`", { parse_mode: "Markdown" });
    }

    const expenses = await prisma.expense.findMany({
      where: {
        userId: user.id,
        merchant: { contains: query, mode: "insensitive" },
      },
      include: { category: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    if (expenses.length === 0) {
      return ctx.reply(`No encontre gastos con "${query}".`);
    }

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);

    let msg = `🔍 *Resultados para "${query}"* (${expenses.length})\n\n`;
    msg += `💰 Total: $${fmt(total)} USD\n\n`;

    expenses.forEach((e) => {
      const date = e.createdAt.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
      const original = e.currency === "COP" ? `$${fmtCOP(e.amount)} COP` : `$${fmt(e.amount)} USD`;
      msg += `${e.category.emoji} ${date} - ${e.merchant} - ${original}\n`;
    });

    if (expenses.length === 15) {
      msg += "\n_Mostrando los 15 mas recientes._";
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // /chat - AI chat about finances
  bot.command("chat", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const question = ctx.message?.text?.replace(/^\/chat\s*/i, "").trim();
    if (!question) {
      return ctx.reply(
        "Uso: /chat _tu pregunta_\nEjemplo: `/chat cuanto gaste en restaurantes este mes?`",
        { parse_mode: "Markdown" }
      );
    }

    await handleChatQuestion(ctx, user.id, question);
  });

  // Callback queries for inline keyboards
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("confirm:")) {
      const pendingId = data.replace("confirm:", "");
      const pending = pendingExpenses.get(pendingId);
      if (!pending) {
        return ctx.answerCallbackQuery({ text: "Gasto expirado" });
      }

      await prisma.expense.create({
        data: {
          userId: pending.userId,
          merchant: pending.merchant,
          amount: pending.amount,
          currency: pending.currency,
          amountUsd: pending.amountUsd,
          categoryId: pending.categoryId,
          descriptionAi: pending.description,
          source: "TELEGRAM",
        },
      });

      pendingExpenses.delete(pendingId);
      await ctx.answerCallbackQuery({ text: "Gasto registrado!" });
      await ctx.editMessageText(
        `✅ Gasto registrado: ${pending.merchant} $${pending.amount.toLocaleString()} ${pending.currency} → ${pending.categoryEmoji} ${pending.categoryName}`
      );
      return;
    }

    if (data.startsWith("cancel:")) {
      const pendingId = data.replace("cancel:", "");
      pendingExpenses.delete(pendingId);
      await ctx.answerCallbackQuery({ text: "Cancelado" });
      await ctx.editMessageText("❌ Gasto cancelado.");
      return;
    }

    if (data.startsWith("chcat:")) {
      const [, pendingId] = data.split(":");
      const pending = pendingExpenses.get(pendingId);
      if (!pending) {
        return ctx.answerCallbackQuery({ text: "Gasto expirado" });
      }

      const categories = await prisma.category.findMany({
        where: { userId: pending.userId, isActive: true },
        orderBy: { sortOrder: "asc" },
      });

      const keyboard = new InlineKeyboard();
      categories.forEach((c, i) => {
        keyboard.text(`${c.emoji} ${c.name}`, `setcat:${pendingId}:${c.id}`);
        if (i % 2 === 1) keyboard.row();
      });

      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      return;
    }

    if (data.startsWith("setcat:")) {
      const [, pendingId, categoryId] = data.split(":");
      const pending = pendingExpenses.get(pendingId);
      if (!pending) {
        return ctx.answerCallbackQuery({ text: "Gasto expirado" });
      }

      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId: pending.userId },
      });

      if (category) {
        pending.categoryId = category.id;
        pending.categoryName = category.name;
        pending.categoryEmoji = category.emoji;
      }

      const keyboard = new InlineKeyboard()
        .text("✅ Confirmar", `confirm:${pendingId}`)
        .text("📂 Cambiar", `chcat:${pendingId}`)
        .text("❌ Cancelar", `cancel:${pendingId}`);

      await ctx.answerCallbackQuery({ text: `Categoria: ${pending.categoryEmoji} ${pending.categoryName}` });
      await ctx.editMessageText(
        `${pending.merchant} - $${pending.amount.toLocaleString()} ${pending.currency} ($${pending.amountUsd.toFixed(2)} USD)\n${pending.categoryEmoji} ${pending.categoryName}\n\n¿Confirmar?`,
        { reply_markup: keyboard }
      );
      return;
    }

    // Keep duplicate - user confirms it's a new expense
    if (data.startsWith("keepdup:")) {
      const _expenseId = data.replace("keepdup:", "");
      await ctx.answerCallbackQuery({ text: "Gasto conservado" });
      await ctx.editMessageText("✅ Entendido, el gasto se conserva.");
      return;
    }

    // Delete duplicate expense
    if (data.startsWith("deldup:")) {
      const expenseId = data.replace("deldup:", "");
      try {
        await prisma.expense.delete({ where: { id: expenseId } });
        await ctx.answerCallbackQuery({ text: "Duplicado eliminado" });
        await ctx.editMessageText("🗑 Gasto duplicado eliminado.");
      } catch {
        await ctx.answerCallbackQuery({ text: "No se pudo eliminar" });
        await ctx.editMessageText("⚠️ No se pudo eliminar el gasto. Puede que ya haya sido eliminado.");
      }
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // Text messages - linking code or expense
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const chatId = String(ctx.chat.id);

    // Check if it's a linking code
    if (/^\d{6}$/.test(text)) {
      const userWithCode = await prisma.user.findFirst({
        where: {
          telegramLinkCode: text,
          telegramLinkCodeExp: { gte: new Date() },
        },
        select: { id: true, name: true },
      });

      if (!userWithCode) {
        return ctx.reply("Codigo invalido o expirado. Genera uno nuevo en la app.");
      }

      await prisma.user.update({
        where: { id: userWithCode.id },
        data: {
          telegramChatId: chatId,
          telegramLinkCode: null,
          telegramLinkCodeExp: null,
        },
      });

      return ctx.reply(`✅ Vinculado! Hola ${userWithCode.name}. Ahora puedes registrar gastos aqui.\n\nEnvia /ayuda para ver los comandos.`);
    }

    // Find user
    const user = await findUserByChatId(chatId);
    if (!user) {
      return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");
    }

    // Check if user has a pending amount request (from Apple Pay shortcut with amount=0)
    const pendingAmount = pendingAmountRequests.get(chatId);
    if (pendingAmount) {
      const cleaned = text.replace(/[^0-9.,]/g, "");
      const parsed = parseFloat(cleaned.replace(/,/g, ""));
      if (cleaned && !isNaN(parsed) && parsed > 0) {
        pendingAmountRequests.delete(chatId);
        try {
          const amountUsd = await convertToUSD(parsed, pendingAmount.currency);
          await prisma.expense.update({
            where: { id: pendingAmount.expenseId },
            data: { amount: parsed, amountUsd },
          });
          const formatted = pendingAmount.currency === "COP"
            ? `$${parsed.toLocaleString("es-CO")} COP`
            : `$${parsed.toFixed(2)} USD`;
          await ctx.reply(`✅ Actualizado: ${pendingAmount.merchant} → ${formatted}`);
        } catch (error) {
          console.error("[BOT] Error updating pending amount:", error);
          await ctx.reply("Error al actualizar el monto. Puedes editarlo desde la app.");
        }
        return;
      }
      // If not a valid number, clear the pending and continue with normal flow
      pendingAmountRequests.delete(chatId);
    }

    // Detect natural language questions and route to AI chat
    if (isQuestion(text)) {
      await handleChatQuestion(ctx, user.id, text);
      return;
    }

    // Parse expense from text using AI
    await processExpenseText(ctx, user.id, text);
  });

  return bot;
}

async function findUserByChatId(chatId: string) {
  return prisma.user.findFirst({
    where: { telegramChatId: chatId },
    select: { id: true, name: true, defaultSpaceId: true },
  });
}

async function processExpenseText(ctx: Context, userId: string, text: string) {
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 150,
      messages: [
        {
          role: "system",
          content: 'Eres un parser de gastos. Del mensaje del usuario extrae merchant (nombre del comercio), amount (numero), y currency (COP o USD). Usa las reglas de formato colombiano: si despues del punto hay 3+ digitos es COP (miles), si hay 1-2 digitos es USD. Sin punto y >= 100, es COP. Responde SOLO JSON: { "merchant": "...", "amount": 0, "currency": "COP" }',
        },
        { role: "user", content: text },
      ],
    });

    const responseText = response.choices[0]?.message?.content || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return ctx.reply("No pude entender tu mensaje. Intenta con formato: 'Comercio Monto'");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const merchant = parsed.merchant as string;
    const amount = parsed.amount as number;
    const currency = parsed.currency as "COP" | "USD";

    if (!merchant || !amount) {
      return ctx.reply("No pude extraer el comercio y monto. Intenta de nuevo.");
    }

    // Classify
    const categories = await prisma.category.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, emoji: true },
    });

    const classification = await classifyExpense(merchant, categories);
    const category = categories.find((c) => c.id === classification.categoryId);

    const amountUsd = await convertToUSD(amount, currency);

    // Create pending expense
    const pendingId = `${userId}-${Date.now()}`;
    pendingExpenses.set(pendingId, {
      userId,
      merchant,
      amount,
      currency,
      amountUsd,
      categoryId: classification.categoryId,
      categoryName: category?.name || "Otros",
      categoryEmoji: category?.emoji || "📦",
      description: classification.description,
    });

    // Auto-expire after 5 minutes
    setTimeout(() => pendingExpenses.delete(pendingId), 5 * 60 * 1000);

    const keyboard = new InlineKeyboard()
      .text("✅ Confirmar", `confirm:${pendingId}`)
      .text("📂 Cambiar", `chcat:${pendingId}`)
      .text("❌ Cancelar", `cancel:${pendingId}`);

    const formattedAmount =
      currency === "COP"
        ? `$${amount.toLocaleString("es-CO")} COP`
        : `$${amount.toFixed(2)} USD`;

    await ctx.reply(
      `${merchant} - ${formattedAmount} ($${amountUsd.toFixed(2)} USD)\n${category?.emoji} ${category?.name}\n\n¿Confirmar?`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error("Process expense text error:", error);
    await ctx.reply("Error al procesar el mensaje. Intenta de nuevo.");
  }
}

// --- Question detection ---

function isQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (lower.includes("?")) return true;
  if (lower.startsWith("¿")) return true;
  if (lower.startsWith("cuanto") || lower.startsWith("cuánto")) return true;
  if (lower.startsWith("cual") || lower.startsWith("cuál")) return true;
  if (lower.startsWith("como") || lower.startsWith("cómo")) return true;
  return false;
}

// --- AI Chat with financial context ---

async function handleChatQuestion(ctx: Context, userId: string, question: string) {
  try {
    await ctx.replyWithChatAction("typing");

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      monthlyExpenses,
      topCategories,
      activeIncomes,
      recentExpenses,
      savingsGoals,
    ] = await Promise.all([
      prisma.expense.aggregate({
        where: { userId, createdAt: { gte: startOfMonth } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["categoryId"],
        where: { userId, createdAt: { gte: startOfMonth } },
        _sum: { amountUsd: true },
        orderBy: { _sum: { amountUsd: "desc" } },
        take: 5,
      }),
      prisma.income.findMany({
        where: { userId, isActive: true },
        select: { amountUsd: true, frequency: true, name: true },
      }),
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
      prisma.savingsGoal.findMany({
        where: { userId, isCompleted: false },
        select: { name: true, targetAmountUsd: true, currentAmountUsd: true },
      }),
    ]);

    // Resolve category names
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

    const recentExpensesFormatted = recentExpenses
      .map(
        (e) =>
          `- ${e.merchant}: $${e.amountUsd.toFixed(2)} USD (${e.category.name}) - ${e.createdAt.toLocaleDateString("es-CO")}`
      )
      .join("\n");

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

    const systemPrompt = `Eres un asistente financiero para Telegram. Responde siempre en espanol, de forma MUY concisa (maximo 2-3 lineas). Usa los datos reales del usuario.

CONTEXTO FINANCIERO (este mes):
Gastos totales: $${totalExpensesThisMonth.toFixed(2)} USD (${expenseCount} transacciones)
Ingreso mensual: $${totalMonthlyIncome.toFixed(2)} USD
Disponible: $${remainingBudget.toFixed(2)} USD

Top categorias:
${topCategoriesFormatted || "Sin gastos este mes."}

Ultimos gastos:
${recentExpensesFormatted || "Sin gastos recientes."}

Metas de ahorro:
${savingsGoalsFormatted}

INSTRUCCIONES:
- Responde en espanol, MUY conciso (es Telegram, pantalla pequena).
- Referencia datos reales cuando sea relevante.
- Da consejos practicos y personalizados.
- Si no es sobre finanzas, redirige amablemente.
- No uses markdown excesivo, solo *negritas* cuando sea necesario.`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content ?? "No pude generar una respuesta. Intenta de nuevo.";

    await ctx.reply(`🤖 ${reply}`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Chat question error:", error);
    await ctx.reply("Error al procesar tu pregunta. Intenta de nuevo.");
  }
}

// --- Anomaly & Duplicate Detection ---

interface ExpenseNotifyParams {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  amountUsd: number;
  categoryId: string;
  categoryName: string;
}

export async function checkAnomalyAndNotify(
  userId: string,
  expense: ExpenseNotifyParams
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });

    if (!user?.telegramChatId) return;

    // Get average for this category in last 90 days (excluding the new expense)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const avgResult = await prisma.expense.aggregate({
      where: {
        userId,
        categoryId: expense.categoryId,
        id: { not: expense.id },
        createdAt: { gte: ninetyDaysAgo },
      },
      _avg: { amountUsd: true },
      _count: true,
    });

    const avgAmountUsd = avgResult._avg.amountUsd;
    const count = avgResult._count;

    // Need at least 3 expenses to establish an average
    if (!avgAmountUsd || count < 3) return;

    const ratio = expense.amountUsd / avgAmountUsd;

    if (ratio > 2) {
      const bot = getBot();
      const ratioStr = ratio.toFixed(1);
      const message =
        `⚠️ *Alerta de gasto inusual*\n\n` +
        `${expense.merchant} - $${fmt(expense.amountUsd)} USD\n` +
        `Esto es ${ratioStr}x mas que tu promedio en ${expense.categoryName}.`;

      await bot.api.sendMessage(user.telegramChatId, message, {
        parse_mode: "Markdown",
      });
    }
  } catch (error) {
    console.error("Anomaly check error:", error);
  }
}

export async function checkDuplicateAndNotify(
  userId: string,
  expense: ExpenseNotifyParams
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });

    if (!user?.telegramChatId) return;

    // Check for duplicate: same merchant (case-insensitive) AND similar amount (within 5%) in last 24 hours
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const possibleDuplicates = await prisma.expense.findMany({
      where: {
        userId,
        id: { not: expense.id },
        merchant: { equals: expense.merchant, mode: "insensitive" },
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: { id: true, merchant: true, amountUsd: true, createdAt: true },
    });

    // Check if any have similar amount (within 5%)
    const duplicate = possibleDuplicates.find((d) => {
      const diff = Math.abs(d.amountUsd - expense.amountUsd);
      const threshold = expense.amountUsd * 0.05;
      return diff <= threshold;
    });

    if (!duplicate) return;

    const bot = getBot();
    const keyboard = new InlineKeyboard()
      .text("✅ Es nuevo", `keepdup:${expense.id}`)
      .text("🗑 Eliminar duplicado", `deldup:${expense.id}`);

    const message =
      `⚠️ *Posible gasto duplicado*\n\n` +
      `${expense.merchant} - $${fmt(expense.amountUsd)} USD\n` +
      `Ya tienes un gasto similar registrado en las ultimas 24h.\n\n` +
      `¿Quieres conservarlo o eliminarlo?`;

    await bot.api.sendMessage(user.telegramChatId, message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error("Duplicate check error:", error);
  }
}

// Request amount via Telegram for expenses created with amount=0 (Apple Pay shortcut)
export async function requestAmountViaTelegram(
  userId: string,
  expenseId: string,
  merchant: string,
  currency: "COP" | "USD"
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });

    if (!user?.telegramChatId) return;

    pendingAmountRequests.set(user.telegramChatId, { expenseId, merchant, currency });

    // Auto-expire after 30 minutes
    setTimeout(() => {
      const current = pendingAmountRequests.get(user.telegramChatId!);
      if (current?.expenseId === expenseId) {
        pendingAmountRequests.delete(user.telegramChatId!);
      }
    }, 30 * 60 * 1000);

    const bot = getBot();
    await bot.api.sendMessage(
      user.telegramChatId,
      `💳 *Gasto registrado sin monto*\n\n` +
        `🏪 ${merchant}\n\n` +
        `Responde con el monto (ej: \`35000\` o \`15.50\`):`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("[BOT] Error requesting amount via Telegram:", error);
  }
}

// Singleton bot instance
let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    botInstance = createBot();
  }
  return botInstance;
}
