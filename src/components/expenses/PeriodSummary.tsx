"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from "recharts";
import { CalendarDays, Minus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

interface CategorySlice {
  id: string;
  name: string;
  emoji: string;
  color: string;
  total: number;
  count: number;
}

interface SummaryResponse {
  total: number;
  currency: string;
  count: number;
  avgDaily: number;
  daysWithExpenses: number;
  biggestExpense: { merchant: string; amount: number } | null;
  topCategory: CategorySlice | null;
  categoryDistribution: CategorySlice[];
  previousPeriod: { total: number; count: number; changePercent: number | null } | null;
  totalUsd: number;
}

const TOOLTIP_STYLE = {
  background: "rgba(20,23,32,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  color: "#F1F3F7",
  fontSize: "13px",
};

/** Rows beyond this are collapsed into a "y N más" line. */
const MAX_LISTED_CATEGORIES = 7;

const formatCop = (value: number): string => `$${Math.round(value).toLocaleString("es-CO")}`;

const formatCompactCop = (value: number): string => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value)}`;
};

function CategoryTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const slice = payload[0]?.payload as CategorySlice | undefined;
  if (!slice) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-medium">
        {slice.emoji} {slice.name}
      </p>
      <p className="font-numbers text-brand">{formatCop(slice.total)} COP</p>
      <p className="text-[11px] opacity-60">
        {slice.count} gasto{slice.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  valueClassName,
  details,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  valueClassName?: string;
  details: string[];
}) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg text-brand bg-brand/10 flex items-center justify-center">{icon}</div>
        <span className="text-[10px] sm:text-xs font-medium text-text-muted uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className={`text-xl sm:text-2xl font-bold font-numbers break-words ${valueClassName ?? "text-text-primary"}`}>
        {value}
        {unit && <span className="text-xs font-normal text-text-muted ml-1.5">{unit}</span>}
      </p>
      {details.map((detail) => (
        <p key={detail} className="text-xs text-text-muted mt-1 truncate">
          {detail}
        </p>
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-4 sm:p-5 space-y-3">
            <Skeleton className="h-4 w-24 bg-surface-overlay" />
            <Skeleton className="h-7 w-28 bg-surface-overlay" />
            <Skeleton className="h-3 w-20 bg-surface-overlay" />
          </div>
        ))}
      </div>
      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-56 w-full rounded-xl bg-surface-raised" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg bg-surface-raised" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PeriodSummaryProps {
  spaceId: string;
  categoryId: string;
  /** ISO window of the active period; mirrors what the expense list requests. */
  dateFrom: string | null;
  dateTo: string | null;
  period: string;
  /** Human label of the active period, e.g. "Septiembre 2026". */
  periodLabel: string;
}

/** Totals, period-over-period change and category breakdown for the selected window. */
export default function PeriodSummary({
  spaceId,
  categoryId,
  dateFrom,
  dateTo,
  period,
  periodLabel,
}: PeriodSummaryProps) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({ currency: "COP", period });
        if (spaceId !== "all") params.set("spaceId", spaceId);
        if (categoryId !== "all") params.set("categoryId", categoryId);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        const res = await apiClient<SummaryResponse>(`/api/dashboard?${params.toString()}`);
        if (cancelled) return;
        setData(res);
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching period summary:", err);
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [spaceId, categoryId, dateFrom, dateTo, period]);

  const slices = useMemo<CategorySlice[]>(
    () => (data?.categoryDistribution ?? []).filter((c) => c.total > 0),
    [data]
  );

  const total = data?.total ?? 0;
  const share = (value: number): number => (total > 0 ? (value / total) * 100 : 0);

  if (loading) return <SummarySkeleton />;
  if (failed || !data) {
    return (
      <div className="glass-card rounded-2xl p-6 text-center">
        <p className="text-sm text-text-muted">No se pudo cargar el balance del período.</p>
      </div>
    );
  }

  const { previousPeriod } = data;
  const change = previousPeriod?.changePercent ?? null;
  const spendingUp = change !== null && change > 0;

  const changeCard =
    previousPeriod === null
      ? {
          icon: <Minus className="h-4 w-4" />,
          value: "—",
          valueClassName: "text-text-muted",
          details: ["Sin período de comparación"],
        }
      : change === null
        ? {
            // previousPeriod.total was exactly 0: a percentage would be meaningless.
            icon: <TrendingUp className="h-4 w-4" />,
            value: formatCop(previousPeriod.total),
            valueClassName: "text-text-primary",
            details: ["Período anterior sin gastos"],
          }
        : {
            icon: spendingUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />,
            value: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`,
            valueClassName: spendingUp ? "text-red-accent" : "text-brand",
            details: [
              `Anterior: ${formatCop(previousPeriod.total)}`,
              `${previousPeriod.count} gasto${previousPeriod.count === 1 ? "" : "s"}`,
            ],
          };

  const listed = slices.slice(0, MAX_LISTED_CATEGORIES);
  const hiddenCount = slices.length - listed.length;
  const hiddenTotal = slices.slice(MAX_LISTED_CATEGORIES).reduce((sum, c) => sum + c.total, 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Balance · {periodLabel}
        </h2>
        <p className="text-xs text-text-muted">
          {data.count} gasto{data.count === 1 ? "" : "s"} en el período
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 stagger-children">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total gastado"
          value={formatCop(total)}
          unit="COP"
          details={[
            `$${data.totalUsd.toFixed(2)} USD`,
            ...(data.biggestExpense
              ? [`Mayor: ${data.biggestExpense.merchant} · ${formatCop(data.biggestExpense.amount)}`]
              : []),
          ]}
        />

        <StatCard
          icon={changeCard.icon}
          label="Vs. anterior"
          value={changeCard.value}
          valueClassName={changeCard.valueClassName}
          details={changeCard.details}
        />

        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Promedio diario"
          value={formatCop(data.avgDaily)}
          unit="COP"
          details={[
            `${data.daysWithExpenses} día${data.daysWithExpenses === 1 ? "" : "s"} con gastos`,
          ]}
        />

        <StatCard
          icon={
            data.topCategory ? (
              <span className="text-sm leading-none">{data.topCategory.emoji}</span>
            ) : (
              <Minus className="h-4 w-4" />
            )
          }
          label="Categoría principal"
          value={data.topCategory ? formatCop(data.topCategory.total) : "—"}
          unit={data.topCategory ? "COP" : undefined}
          details={
            data.topCategory
              ? [`${data.topCategory.name} · ${share(data.topCategory.total).toFixed(0)}% del total`]
              : ["Sin gastos en el período"]
          }
        />
      </div>

      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Distribución por categoría</h3>

        {slices.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">🫙</span>
            </div>
            <p className="text-text-secondary text-sm font-medium">Sin gastos en este período</p>
            <p className="text-text-muted text-xs mt-1">
              Cambia el rango de fechas o registra un gasto para ver el desglose.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={2}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.id} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={CategoryTooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl leading-none">{data.topCategory?.emoji ?? "💸"}</span>
                <span className="mt-1 font-numbers text-lg font-bold text-text-primary">
                  {formatCompactCop(total)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Total COP</span>
              </div>
            </div>

            <ul className="space-y-3">
              {listed.map((slice) => {
                const pct = share(slice.total);
                return (
                  <li key={slice.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-primary">
                        <span className="shrink-0">{slice.emoji}</span>
                        <span className="truncate">{slice.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-numbers text-sm font-semibold text-text-primary">
                          {formatCop(slice.total)}
                        </span>
                        <span className="ml-1.5 font-numbers text-xs text-text-muted">
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: slice.color }}
                      />
                    </div>
                  </li>
                );
              })}
              {hiddenCount > 0 && (
                <li className="flex items-baseline justify-between gap-2 pt-1 text-xs text-text-muted">
                  <span>y {hiddenCount} categoría{hiddenCount === 1 ? "" : "s"} más</span>
                  <span className="font-numbers">{formatCop(hiddenTotal)}</span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
