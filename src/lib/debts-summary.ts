import { prisma } from "@/lib/prisma";
import { fetchExchangeRate } from "@/lib/currency";
import { buildBalanceGrid, type DebtKind } from "@/lib/debts";

export interface OutstandingDebtSummary {
  totalDebtCop: number;
  totalDebtUsd: number;
  year: number;
  month: number;
}

/**
 * Finds the most recent month, no later than the current one, that actually
 * has debt data (saldos/pagos, or sueldo/TRM) in the Deudas module, and
 * returns that month's DEUDA TOTAL. Used to fold outstanding debt into the
 * dashboard's balance figures — e.g. if September has no entries yet but
 * August does, August's total is used until September gets filled in.
 */
export async function getLatestDebtSummary(userId: string): Promise<OutstandingDebtSummary | null> {
  const now = new Date();
  const currentIdx = now.getFullYear() * 12 + (now.getMonth() + 1);

  const [debts, entries, monthParams, fallbackTrm] = await Promise.all([
    prisma.debt.findMany({ where: { userId, isActive: true } }),
    prisma.debtEntry.findMany({
      where: { debt: { userId, isActive: true } },
      select: { debtId: true, year: true, month: true, balance: true, payment: true },
    }),
    prisma.debtMonth.findMany({ where: { userId } }),
    fetchExchangeRate(),
  ]);

  if (debts.length === 0) return null;

  const idxs = [
    ...entries.map((e) => e.year * 12 + e.month),
    ...monthParams
      .filter((p) => p.salary !== 0 || p.extraIncome !== 0 || p.trm !== null)
      .map((p) => p.year * 12 + p.month),
  ].filter((idx) => idx <= currentIdx);

  if (idxs.length === 0) return null;

  const latestIdx = Math.max(...idxs);
  const year = Math.floor((latestIdx - 1) / 12);
  const month = ((latestIdx - 1) % 12) + 1;

  const grid = buildBalanceGrid({
    months: [{ year, month }],
    debts: debts.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind as DebtKind,
      currency: d.currency,
      creditLimit: d.creditLimit,
      isNegative: d.isNegative,
      isActive: d.isActive,
      sortOrder: d.sortOrder,
    })),
    entries: entries.filter((e) => e.year * 12 + e.month === latestIdx),
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

  const summary = grid[0]?.summary;
  if (!summary) return null;

  return {
    totalDebtCop: summary.totalDebt,
    totalDebtUsd: summary.trm > 0 ? summary.totalDebt / summary.trm : 0,
    year,
    month,
  };
}
