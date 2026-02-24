import { prisma } from "@/lib/prisma";

export async function triggerWebhooks(
  userId: string,
  event: string,
  payload: object
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, isActive: true },
    select: { id: true, url: true, secret: true },
  });

  if (webhooks.length === 0) return;

  const body = JSON.stringify({
    event,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  const requests = webhooks.map((webhook) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": event,
    };

    if (webhook.secret) {
      headers["X-Webhook-Secret"] = webhook.secret;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    return fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    })
      .catch((error) => {
        console.error(`Webhook ${webhook.id} failed for event ${event}:`, error);
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  });

  // Fire and forget
  Promise.allSettled(requests).catch(() => {
    // Silently ignore aggregate errors
  });
}
