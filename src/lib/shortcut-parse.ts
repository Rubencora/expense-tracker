// Tolerant parsing of the JSON an iOS "Transaction" automation sends to
// /api/expenses/shortcut. iOS Shortcuts is unpredictable: keys arrive with
// stray whitespace, the Wallet "Currency Amount" may be coerced to 0, to a
// string like "$12.34" / "US$ 45.000,00" / "COP 45.000", or nested as
// { amount: 12.34, currencyCode: "USD" }. This module digs the best amount and
// currency out of whatever arrived.

export type Currency = "COP" | "USD";

export interface ParsedShortcutPayload {
  merchant: string;
  amount: number; // 0 when no usable amount was found
  currency: Currency;
  amountSource: string | null; // which key produced the amount (for diagnostics)
  currencySource: string | null;
}

const AMOUNT_KEY = /amount|monto|total|valor|value|price|precio|importe|cost|sum|cantidad|pago|payment/i;
const MERCHANT_KEY = /merchant|comercio|store|tienda|name|nombre|establecimiento|payee|vendor|description|descripcion/i;
const CURRENCY_KEY = /currency|moneda|currencycode|code/i;

const USD_HINTS = /\b(usd|us\$|dolar|dólar|dollar)\b|us\$|\$us/i;
const COP_HINTS = /\b(cop|peso|pesos)\b/i;

interface Candidate {
  amount: number;
  currencyHint: Currency | null;
  source: string;
  priority: number; // lower is better
}

function isCurrencyCode(v: unknown): v is Currency {
  return typeof v === "string" && /^(cop|usd)$/i.test(v.trim());
}

/**
 * Parses a money string in either Colombian or US notation:
 *   "45.000" → 45000 (COP thousands) · "45.000,50" → 45000.5 · "12.34" → 12.34
 *   "1,234.56" → 1234.56 · "$12.34" → 12.34 · "US$ 45" → 45 · "-12.3" → 12.3
 * Returns null when no digits are present. The currency hint is derived from
 * the text (USD/US$/COP/pesos) when available.
 */
export function parseMoneyString(input: string): { amount: number; currencyHint: Currency | null } | null {
  const text = input.trim();
  if (!text) return null;
  const currencyHint: Currency | null = USD_HINTS.test(text) ? "USD" : COP_HINTS.test(text) ? "COP" : null;

  const m = text.match(/-?\d[\d.,\s']*\d|-?\d/);
  if (!m) return null;
  let num = m[0].replace(/[\s']/g, "").replace(/^-/, "");

  const lastDot = num.lastIndexOf(".");
  const lastComma = num.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators: the last one is the decimal separator.
    if (lastComma > lastDot) num = num.replace(/\./g, "").replace(",", ".");
    else num = num.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const after = num.length - lastComma - 1;
    const commas = (num.match(/,/g) ?? []).length;
    // "12,34" → decimal · "45,000" / "1,234,567" → thousands
    num = after === 3 || commas > 1 ? num.replace(/,/g, "") : num.replace(",", ".");
  } else if (lastDot !== -1) {
    const after = num.length - lastDot - 1;
    const dots = (num.match(/\./g) ?? []).length;
    // "45.000" / "1.234.567" → thousands (Colombian) · "12.34" / "12.3" → decimal
    if (dots > 1 || (after === 3 && currencyHint !== "USD")) num = num.replace(/\./g, "");
  }

  const amount = Number(num);
  if (!Number.isFinite(amount)) return null;
  return { amount: Math.abs(amount), currencyHint };
}

function walk(
  value: unknown,
  path: string,
  depth: number,
  out: { amounts: Candidate[]; currencies: { code: Currency; source: string; priority: number }[]; merchants: { text: string; source: string; priority: number }[] }
): void {
  if (depth > 6) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [rawKey, v] of Object.entries(value as Record<string, unknown>)) {
      const key = rawKey.trim();
      const keyNorm = key.replace(/[\s_-]/g, "").toLowerCase();
      const p = path ? `${path}.${key}` : key;
      const amountKey = AMOUNT_KEY.test(keyNorm);
      const currencyKey = CURRENCY_KEY.test(keyNorm);
      const merchantKey = MERCHANT_KEY.test(keyNorm);

      if (currencyKey && isCurrencyCode(v)) {
        out.currencies.push({ code: v.trim().toUpperCase() as Currency, source: p, priority: depth });
        continue;
      }
      if (amountKey) {
        if (typeof v === "number") {
          out.amounts.push({ amount: Math.abs(v), currencyHint: null, source: p, priority: depth });
          continue;
        }
        if (typeof v === "string") {
          // A JSON object serialized inside a string (Shortcuts does this with dictionaries)
          const trimmed = v.trim();
          if (/^[\[{]/.test(trimmed)) {
            try {
              walk(JSON.parse(trimmed), p, depth + 1, out);
              continue;
            } catch {
              /* not JSON, fall through */
            }
          }
          const parsed = parseMoneyString(v);
          if (parsed) out.amounts.push({ ...parsed, source: p, priority: depth });
          continue;
        }
        if (v && typeof v === "object") {
          walk(v, p, depth + 1, out);
          continue;
        }
      }
      if (merchantKey && typeof v === "string" && v.trim()) {
        out.merchants.push({ text: v.trim(), source: p, priority: depth + (keyNorm.includes("merchant") ? 0 : 1) });
        // A merchant string may still embed the amount ("Publix $23.45") — lowest priority.
        const embedded = v.match(/(?:us\$|\$|usd|cop)\s?-?\d[\d.,]*|\d[\d.,]*\s?(?:usd|cop|us\$|\$)/i);
        if (embedded) {
          const parsed = parseMoneyString(embedded[0]);
          if (parsed) out.amounts.push({ ...parsed, source: `${p} (texto)`, priority: 50 + depth });
        }
        continue;
      }
      if (v && typeof v === "object") walk(v, p, depth + 1, out);
      else if (typeof v === "string" && /^[\[{]/.test(v.trim())) {
        try {
          walk(JSON.parse(v.trim()), p, depth + 1, out);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/**
 * Extracts merchant / amount / currency from an arbitrary shortcut payload.
 * `defaultCurrency` is used when nothing in the payload says otherwise.
 */
export function parseShortcutPayload(
  body: unknown,
  defaultCurrency: Currency = "COP"
): ParsedShortcutPayload {
  const out = { amounts: [] as Candidate[], currencies: [] as { code: Currency; source: string; priority: number }[], merchants: [] as { text: string; source: string; priority: number }[] };
  walk(body, "", 0, out);

  out.merchants.sort((a, b) => a.priority - b.priority);
  const merchant = out.merchants[0]?.text ?? "";

  out.currencies.sort((a, b) => a.priority - b.priority);
  const explicitCurrency = out.currencies[0] ?? null;

  // Prefer explicit amount keys; among them prefer non-zero values, then shallower keys.
  const ranked = [...out.amounts].sort((a, b) => {
    const za = a.amount > 0 ? 0 : 1;
    const zb = b.amount > 0 ? 0 : 1;
    return za - zb || a.priority - b.priority;
  });
  const best = ranked[0] ?? null;

  let currency: Currency;
  let currencySource: string | null;
  if (explicitCurrency) {
    currency = explicitCurrency.code;
    currencySource = explicitCurrency.source;
  } else if (best?.currencyHint) {
    currency = best.currencyHint;
    currencySource = `${best.source} (texto)`;
  } else if (best && best.amount > 0) {
    // No hints at all: Colombian rule — amounts with decimals < 1000 look like USD.
    currency = best.amount < 1000 && !Number.isInteger(best.amount) ? "USD" : defaultCurrency;
    currencySource = "heuristica";
  } else {
    currency = defaultCurrency;
    currencySource = "default";
  }

  return {
    merchant,
    amount: best ? best.amount : 0,
    currency,
    amountSource: best ? best.source : null,
    currencySource,
  };
}
