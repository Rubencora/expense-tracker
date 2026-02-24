interface ParsedCurrency {
  amount: number;
  currency: "COP" | "USD";
}

/**
 * Parses currency input following Colombian conventions:
 * - If after a dot there are 3+ digits → COP (thousands separator)
 * - If after a dot there are 1-2 digits → USD (decimal)
 * - No dot → if amount >= 100 assume COP, else USD
 */
export function parseCurrency(input: string): ParsedCurrency {
  const cleaned = input.replace(/[^0-9.,]/g, "").trim();

  // Check if there's a dot with digits after
  const dotMatch = cleaned.match(/\.(\d+)$/);

  if (dotMatch) {
    const decimals = dotMatch[1];
    if (decimals.length >= 3) {
      // Colombian format: dot is thousands separator
      const amount = parseFloat(cleaned.replace(/\./g, ""));
      return { amount, currency: "COP" };
    } else {
      // USD format: dot is decimal
      const amount = parseFloat(cleaned.replace(/,/g, ""));
      return { amount, currency: "USD" };
    }
  }

  // No dot - parse as integer
  const amount = parseFloat(cleaned.replace(/[.,]/g, ""));
  if (amount >= 100) {
    return { amount, currency: "COP" };
  }
  return { amount, currency: "USD" };
}

let cachedRate: { rate: number; fetchedAt: number } | null = null;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

async function fetchExchangeRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_DURATION_MS) {
    return cachedRate.rate;
  }

  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    const data = await res.json();
    const rate = data.rates.COP as number;
    cachedRate = { rate, fetchedAt: Date.now() };
    return rate;
  } catch {
    const fallback = parseFloat(process.env.FALLBACK_EXCHANGE_RATE || "4200");
    return fallback;
  }
}

export async function convertToUSD(
  amount: number,
  currency: string
): Promise<number> {
  if (currency === "USD") return Math.round(amount * 100) / 100;

  const rate = await fetchExchangeRate();
  return Math.round((amount / rate) * 100) / 100;
}

export function formatCOP(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}

export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
