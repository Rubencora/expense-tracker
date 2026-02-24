import { NextRequest, NextResponse } from "next/server";
import { getBot } from "@/lib/telegram/bot";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.JWT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bot = getBot();
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL!;

    await bot.api.setWebhook(webhookUrl);

    return NextResponse.json({
      success: true,
      message: `Webhook registrado: ${webhookUrl}`,
    });
  } catch (error) {
    console.error("Setup webhook error:", error);
    return NextResponse.json(
      { error: "Error al registrar el webhook" },
      { status: 500 }
    );
  }
}
