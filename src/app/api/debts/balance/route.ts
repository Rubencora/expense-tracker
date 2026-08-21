import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchExchangeRate } from "@/lib/currency";
import {
  addMonths,
  buildBalanceGrid,
  monthRange,
  parseMonthKey,
  type DebtKind,
} from "@/lib/debts";

const MAX_MONTHS = 60;

/**
 * GET /api/debts/balance?from=YYYY-MM&to=YYYY-MM&includeInactive=true
 * Returns the month-by-month grid with all computed summaries.
 * Defaults to the last 12 months ending in the current month.
 */
export const GET = authMiddleware(async (req, { userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const current = { year: now.getFullYear(), month: now.getMonth() + 1 };

    const to = parseMonthKey(searchParams.get("to") ?? "") ?? current;
    const from = parseMonthKey(searchParams.get("from") ?? "") ?? addMonths(to.year, to.month, -11);
    const includeInactive = searchParams.get("includeInactive") === "true";

    let months = monthRange(from, to);
    if (months.length === 0) {
      return NextResponse.json({ error: "Rango de meses invalido" }, { status: 400 });
    }
    if (months.length > MAX_MONTHS) {
      months = months.slice(months.length - MAX_MONTHS);
    }
    const first = months[0];
    const last = months[months.length - 1];
    const fromIdx = first.year * 12 + first.month;
    const toIdx = last.year * 12 + last.month;

    const [debts, monthParams, fallbackTrm] = await Promise.all([
      prisma.debt.findMany({
        where: { userId, ...(includeInactive ? {} : { isActive: true }) },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      // All params (not only the range) so TRM can be carried forward.
      prisma.debtMonth.findMany({ where: { userId } }),
      fetchExchangeRate(),
    ]);

    const debtIds = debts.map((d) => d.id);
    const rawEntries = debtIds.length
      ? await prisma.debtEntry.findMany({ where: { debtId: { in: debtIds } } })
      : [];

    // Also compute the month right before the range to get the first debtDelta.
    const prev = addMonths(first.year, first.month, -1);
    const entries = rawEntries.filter((e) => {
      const idx = e.year * 12 + e.month;
      return idx >= fromIdx - 1 && idx <= toIdx;
    });

    const grid = buildBalanceGrid({
      months: [prev, ...months],
      debts: debts.map((d) => ({
        id: d.id,
        name: d.name,
        kind: d.kind as DebtKind,
        currency: d.currency,
        creditLimit: d.creditLimit,
        isActive: d.isActive,
        sortOrder: d.sortOrder,
      })),
      entries,
      monthParams: monthParams.map((p) => ({
        year: p.year,
        month: p.month,
        salary: p.salary,
        extraIncome: p.extraIncome,
        trm: p.trm,
        notes: p.notes,
      })),
      fallbackTrm,
    });

    const columns = grid.slice(1); // drop the helper previous month

    // Months that have any data, to let the UI offer the full historical range.
    const idxs = [
      ...rawEntries.map((e) => e.year * 12 + e.month),
      ...monthParams.map((p) => p.year * 12 + p.month),
    ];
    const minIdx = idxs.length ? Math.min(...idxs) : null;
    const earliest = minIdx === null ? null : { year: Math.floor((minIdx - 1) / 12), month: ((minIdx - 1) % 12) + 1 };

    return NextResponse.json({
      from: first,
      to: last,
      debts,
      columns,
      fallbackTrm,
      earliest,
    });
  } catch (error) {
    console.error("Debt balance error:", error);
    return NextResponse.json({ error: "Error al calcular el balance" }, { status: 500 });
  }
});
