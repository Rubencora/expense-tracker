"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

/** One month bucket as returned by GET /api/expenses/monthly. */
export interface MonthlyPoint {
  year: number;
  month: number;
  key: string;
  totalUsd: number;
  count: number;
}

const SHORT_MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** "Septiembre 2026" — the explicit label the month navigator shows. */
export function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "2026-09" — matches the `key` returned by the monthly endpoint. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

interface ChartRow {
  key: string;
  year: number;
  month: number;
  label: string;
  title: string;
  total: number;
  count: number;
}

const TOOLTIP_STYLE = {
  background: "rgba(20,23,32,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  color: "#F1F3F7",
  fontSize: "13px",
};

const BAR_COLOR = "#10B981";
const BAR_ACTIVE_COLOR = "#A7F3D0";

const formatCop = (value: number): string => `$${value.toLocaleString("es-CO")}`;

const formatAxisCop = (value: number): string => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value}`;
};

function MonthlyTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-medium">{row.title}</p>
      <p className="font-numbers text-brand">{formatCop(row.total)} COP</p>
      <p className="text-[11px] opacity-60">
        {row.count} gasto{row.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

interface MonthlyExpensesChartProps {
  data: MonthlyPoint[];
  copRate: number;
  loading: boolean;
  /** Key of the month currently shown in the list, highlighted in the chart. */
  activeKey: string | null;
  onSelectMonth: (year: number, month: number) => void;
}

/** Last-12-months overview of expenses; clicking a bar jumps the list to that month. */
export default function MonthlyExpensesChart({
  data,
  copRate,
  loading,
  activeKey,
  onSelectMonth,
}: MonthlyExpensesChartProps) {
  const rows = useMemo<ChartRow[]>(
    () =>
      data.map((m) => ({
        key: m.key,
        year: m.year,
        month: m.month,
        label: `${SHORT_MONTHS[m.month - 1]} ${String(m.year).slice(-2)}`,
        title: monthTitle(m.year, m.month),
        total: Math.round(m.totalUsd * copRate),
        count: m.count,
      })),
    [data, copRate]
  );

  return (
    <section className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-text-primary">Gastos mes a mes</h2>
        <p className="text-xs text-text-muted">Toca una barra para ver ese mes</p>
      </div>
      <div className="mt-4 h-[200px] w-full">
        {loading ? (
          <Skeleton className="h-full w-full rounded-xl bg-surface-raised" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                fontSize={11}
                stroke="#5A6178"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                fontSize={11}
                stroke="#5A6178"
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={formatAxisCop}
              />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={MonthlyTooltip} />
              <Bar
                dataKey="total"
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
                className="cursor-pointer"
                onClick={(_bar, index) => {
                  const row = rows[index];
                  if (row) onSelectMonth(row.year, row.month);
                }}
              >
                {rows.map((row) => (
                  <Cell
                    key={row.key}
                    fill={row.key === activeKey ? BAR_ACTIVE_COLOR : BAR_COLOR}
                    fillOpacity={activeKey && row.key !== activeKey ? 0.55 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
