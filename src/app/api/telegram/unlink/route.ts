import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const POST = authMiddleware(async (_req: NextRequest, { userId }) => {
  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null },
  });
  return NextResponse.json({ success: true });
});
