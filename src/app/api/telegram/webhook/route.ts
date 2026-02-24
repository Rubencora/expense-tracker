import { NextRequest, NextResponse } from "next/server";
import { getBot } from "@/lib/telegram/bot";
import { webhookCallback } from "grammy/web";

// Handle Telegram webhook updates
export async function POST(req: NextRequest) {
  try {
    const bot = getBot();
    const handler = webhookCallback(bot, "std/http");
    return handler(req);
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
