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

export async function generateLinkingCode(userId: string): Promise<string> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await prisma.user.update({
    where: { id: userId },
    data: { telegramLinkCode: code, telegramLinkCodeExp: expiresAt },
  });
  return code;
}

function createBot(): Bot {
  const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

  // /start command
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Hola! Soy tu asistente de gastos.\n\n" +
        "Para vincular tu cuenta, envia tu codigo de 6 digitos desde la pagina de Configuracion de la app.\n\n" +
        "Comandos disponibles:\n" +
        "/ayuda - Ver todos los comandos"
    );
  });

  // /ayuda command
  bot.command("ayuda", async (ctx) => {
    await ctx.reply(
      "Comandos disponibles:\n\n" +
        "Registrar gasto: Envia un mensaje como 'Almuerzo en Crepes 35000' o 'Uber 15.50 USD'\n\n" +
        "/resumen - Resumen del mes\n" +
        "/hoy - Gastos de hoy\n" +
        "/semana - Resumen semanal\n" +
        "/categorias - Lista de categorias\n" +
        "/ayuda - Este mensaje"
    );
  });

  // /resumen and /mes commands
  bot.command(["resumen", "mes"], async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
      include: { category: true },
      orderBy: { amountUsd: "desc" },
    });

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);
    const categoryTotals = new Map<string, { name: string; emoji: string; total: number }>();
    for (const e of expenses) {
      const key = e.category.id;
      const existing = categoryTotals.get(key);
      if (existing) {
        existing.total += e.amountUsd;
      } else {
        categoryTotals.set(key, {
          name: e.category.name,
          emoji: e.category.emoji,
          total: e.amountUsd,
        });
      }
    }

    const top3 = Array.from(categoryTotals.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    let msg = `Resumen del mes:\n\nTotal: $${total.toFixed(2)} USD\nGastos: ${expenses.length}\n`;
    if (top3.length > 0) {
      msg += "\nTop categorias:\n";
      top3.forEach((c) => {
        msg += `${c.emoji} ${c.name}: $${c.total.toFixed(2)}\n`;
      });
    }

    await ctx.reply(msg);
  });

  // /hoy command
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
      return ctx.reply("No tienes gastos registrados hoy.");
    }

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);
    let msg = `Gastos de hoy ($${total.toFixed(2)} USD):\n\n`;
    expenses.forEach((e) => {
      msg += `${e.category.emoji} ${e.merchant} - $${e.amountUsd.toFixed(2)} USD\n`;
    });

    await ctx.reply(msg);
  });

  // /semana command
  bot.command("semana", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id, createdAt: { gte: weekAgo } },
      include: { category: true },
    });

    const total = expenses.reduce((sum, e) => sum + e.amountUsd, 0);
    await ctx.reply(
      `Resumen semanal:\n\nTotal: $${total.toFixed(2)} USD\nGastos: ${expenses.length}`
    );
  });

  // /categorias command
  bot.command("categorias", async (ctx) => {
    const user = await findUserByChatId(String(ctx.chat.id));
    if (!user) return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");

    const categories = await prisma.category.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    const msg = categories.map((c) => `${c.emoji} ${c.name}`).join("\n");
    await ctx.reply(`Tus categorias:\n\n${msg}`);
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

      const expense = await prisma.expense.create({
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
        `Gasto registrado: ${pending.merchant} $${pending.amount.toLocaleString()} ${pending.currency} -> ${pending.categoryEmoji} ${pending.categoryName}`
      );
      return;
    }

    if (data.startsWith("cancel:")) {
      const pendingId = data.replace("cancel:", "");
      pendingExpenses.delete(pendingId);
      await ctx.answerCallbackQuery({ text: "Cancelado" });
      await ctx.editMessageText("Gasto cancelado.");
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
        .text("Confirmar", `confirm:${pendingId}`)
        .text("Cambiar categoria", `chcat:${pendingId}`)
        .text("Cancelar", `cancel:${pendingId}`);

      await ctx.answerCallbackQuery({ text: `Categoria: ${pending.categoryEmoji} ${pending.categoryName}` });
      await ctx.editMessageText(
        `${pending.merchant} - $${pending.amount.toLocaleString()} ${pending.currency} ($${pending.amountUsd.toFixed(2)} USD)\n${pending.categoryEmoji} ${pending.categoryName}\n\nConfirmar?`,
        { reply_markup: keyboard }
      );
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

      return ctx.reply(`Vinculado! Hola ${userWithCode.name}. Ahora puedes registrar gastos aqui.`);
    }

    // Find user
    const user = await findUserByChatId(chatId);
    if (!user) {
      return ctx.reply("Cuenta no vinculada. Envia tu codigo de 6 digitos.");
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
      .text("Confirmar", `confirm:${pendingId}`)
      .text("Cambiar categoria", `chcat:${pendingId}`)
      .text("Cancelar", `cancel:${pendingId}`);

    const formattedAmount =
      currency === "COP"
        ? `$${amount.toLocaleString("es-CO")} COP`
        : `$${amount.toFixed(2)} USD`;

    await ctx.reply(
      `${merchant} - ${formattedAmount} ($${amountUsd.toFixed(2)} USD)\n${category?.emoji} ${category?.name}\n\nConfirmar?`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error("Process expense text error:", error);
    await ctx.reply("Error al procesar el mensaje. Intenta de nuevo.");
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
