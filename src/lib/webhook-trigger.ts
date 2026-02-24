import { prisma } from "@/lib/prisma";

export type WebhookEvent =
  | "expense.created"
  | "expense.deleted"
  | "income.created"
  | "goal.contributed"
  | "budget.exceeded";

const RETRY_DELAYS = [1000, 5000, 30000];
const REQUEST_TIMEOUT = 5000;

async function sendWithRetry(
  webhook: { id: string; url: string; secret: string | null },
  event: string,
  body: string
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": event,
  };

  if (webhook.secret) {
    headers["X-Webhook-Secret"] = webhook.secret;
  }

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(
          `Webhook ${webhook.id} delivered for event ${event} (attempt ${attempt + 1})`
        );
        return;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      clearTimeout(timeoutId);

      const isLastAttempt = attempt === RETRY_DELAYS.length - 1;

      if (isLastAttempt) {
        console.error(
          `Webhook ${webhook.id} failed permanently for event ${event} after ${RETRY_DELAYS.length} attempts:`,
          error
        );
        return;
      }

      console.error(
        `Webhook ${webhook.id} attempt ${attempt + 1} failed for event ${event}:`,
        error
      );

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }
  }
}

export async function triggerWebhooks(
  userId: string,
  event: WebhookEvent,
  payload: object
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, isActive: true, events: { has: event } },
    select: { id: true, url: true, secret: true },
  });

  if (webhooks.length === 0) return;

  const body = JSON.stringify({
    event,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  // Fire and forget
  Promise.allSettled(
    webhooks.map((webhook) => sendWithRetry(webhook, event, body))
  ).catch(() => {
    // Silently ignore aggregate errors
  });
}
