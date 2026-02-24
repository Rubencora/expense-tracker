"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DollarSign, TrendingUp, ArrowUpRight, Star, Users, Wallet, CalendarCheck, Target, PiggyBank } from "lucide-react";
import Link from "next/link";

interface DashboardData {
  totalUsd: number;
  count: number;
  avgDaily: number;
  daysWithExpenses: number;
  biggestExpense: { merchant: string; amountUsd: number } | null;
  topCategory: {
    id: string;
    name: string;
    emoji: string;
    color: string;
    total: number;
    count: number;
  } | null;
  categoryDistribution: {
    id: string;
    name: string;
    emoji: string;
    color: string;
    total: number;
    count: number;
  }[];
  dailyTrend: { date: string; total: number }[];
  userDistribution?: { id: string; name: string; total: number; count: number }[];
}

interface CashFlowData {
  monthlyIncome: number;
  monthlyExpenses: number;
  balance: number;
  savingsRate: number;
  expenseRatio: number;
  dailyAvailable: number;
  lastMonthExpenses: number;
  lastMonthRatio: number;
  monthlyHistory: { month: string; income: number; expenses: number; balance: number }[];
}

interface AvailableToSpendData {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavings: number;
  totalSavingsCommitted: number;
  availableToSpend: number;
  daysRemaining: number;
  dailyBudget: number;
  activeGoals: {
    id: string;
    name: string;
    icon: string;
    targetAmountUsd: number;
    currentAmountUsd: number;
    isCompleted: boolean;
    deadline: string | null;
  }[];
}

interface SpaceInfo {
  id: string;
  name: string;
}

const CHART_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444", "#EC4899", "#14B8A6", "#F97316", "#6366F1"];
const USER_COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#F97316"];

const TOOLTIP_STYLE = {
  background: "rgba(20,23,32,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  color: "#F1F3F7",
  fontSize: "13px",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null);
  const [availableData, setAvailableData] = useState<AvailableToSpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [selectedSpace, setSelectedSpace] = useState("all");
  const [period, setPeriod] = useState("month");

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSpace !== "all") params.set("spaceId", selectedSpace);
      params.set("period", period);

      const [dashResult, cfResult, atsResult] = await Promise.all([
        apiClient<DashboardData>(`/api/dashboard?${params.toString()}`),
        apiClient<CashFlowData>("/api/cashflow"),
        apiClient<AvailableToSpendData>("/api/available-to-spend").catch(() => null),
      ]);
      setData(dashResult);
      setCashFlow(cfResult);
      setAvailableData(atsResult);
    } catch (err) {
      console.error("Error fetching dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSpace, period]);

  useEffect(() => {
    apiClient<{ spaces: SpaceInfo[] }>("/api/spaces").then((res) => {
      setSpaces(res.spaces);
    });
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <div className="text-center py-12 text-text-muted">
        Error al cargar el dashboard
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">Resumen de tus finanzas</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Tabs value={selectedSpace} onValueChange={setSelectedSpace}>
          <TabsList className="bg-surface-raised border border-border-subtle">
            <TabsTrigger value="all" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">Todos</TabsTrigger>
            <TabsTrigger value="personal" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">Personal</TabsTrigger>
            {spaces.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 bg-surface-raised border-border-subtle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-border-subtle">
            <SelectItem value="today">Hoy</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mes</SelectItem>
            <SelectItem value="all">Todo el tiempo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cash Flow Section */}
      {cashFlow && cashFlow.monthlyIncome > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Flujo de caja</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg text-brand bg-brand/10">
                  <Wallet className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Balance</span>
              </div>
              <p className={`text-2xl font-bold font-numbers ${cashFlow.balance >= 0 ? "text-brand" : "text-red-accent"}`}>
                ${cashFlow.balance.toFixed(2)}
                <span className="text-xs font-normal text-text-muted ml-1.5">USD</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                {cashFlow.savingsRate > 0 ? `${cashFlow.savingsRate.toFixed(0)}% ahorro` : "Sin ahorro"}
              </p>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg text-blue-400 bg-blue-400/10">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Disponible/dia</span>
              </div>
              <p className={`text-2xl font-bold font-numbers ${cashFlow.dailyAvailable >= 0 ? "text-text-primary" : "text-red-accent"}`}>
                ${cashFlow.dailyAvailable.toFixed(2)}
                <span className="text-xs font-normal text-text-muted ml-1.5">USD</span>
              </p>
              <p className="text-xs text-text-muted mt-1">Resto del mes</p>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg text-brand bg-brand/10">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Ingresos</span>
              </div>
              <p className="text-2xl font-bold font-numbers text-text-primary">
                ${cashFlow.monthlyIncome.toFixed(2)}
                <span className="text-xs font-normal text-text-muted ml-1.5">USD/mes</span>
              </p>
              <div className="mt-2 w-full bg-surface-overlay rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${cashFlow.expenseRatio > 1 ? "bg-red-accent" : cashFlow.expenseRatio > 0.8 ? "bg-amber-accent" : "bg-brand"}`}
                  style={{ width: `${Math.min(cashFlow.expenseRatio * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1">
                {(cashFlow.expenseRatio * 100).toFixed(0)}% gastado
              </p>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg text-amber-accent bg-amber-accent/10">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Mes anterior</span>
              </div>
              <p className="text-2xl font-bold font-numbers text-text-primary">
                ${cashFlow.lastMonthExpenses.toFixed(2)}
                <span className="text-xs font-normal text-text-muted ml-1.5">USD</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                {(cashFlow.lastMonthRatio * 100).toFixed(0)}% de ingresos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Available to Spend / Savings Goals */}
      {availableData && (availableData.activeGoals.length > 0 || availableData.monthlySavings > 0) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">En mi bolsillo</h2>
            <Link href="/metas" className="text-xs text-brand hover:text-brand-dark transition-colors">
              Ver metas
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 stagger-children">
            <div className="glass-card rounded-2xl p-5 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg text-brand bg-brand/10">
                  <Wallet className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Disponible</span>
              </div>
              <p className={`text-2xl font-bold font-numbers ${availableData.availableToSpend >= 0 ? "text-brand" : "text-red-accent"}`}>
                ${availableData.availableToSpend.toFixed(2)}
                <span className="text-xs font-normal text-text-muted ml-1.5">USD</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                ${availableData.dailyBudget.toFixed(2)}/dia · {availableData.daysRemaining}d restantes
              </p>
            </div>

            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg text-purple-400 bg-purple-400/10">
                  <PiggyBank className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Ahorrado</span>
              </div>
              <p className="text-2xl font-bold font-numbers text-text-primary">
                ${availableData.monthlySavings.toFixed(2)}
                <span className="text-xs font-normal text-text-muted ml-1.5">este mes</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                ${availableData.totalSavingsCommitted.toFixed(2)} por completar
              </p>
            </div>

            {/* Mini goal cards */}
            {availableData.activeGoals.slice(0, 3).map((goal) => {
              const progress = goal.targetAmountUsd > 0
                ? Math.min((goal.currentAmountUsd / goal.targetAmountUsd) * 100, 100)
                : 0;
              return (
                <Link key={goal.id} href="/metas" className="glass-card glass-card-hover rounded-2xl p-5 block">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{goal.icon}</span>
                    <span className="text-xs font-medium text-text-primary truncate">{goal.name}</span>
                  </div>
                  <div className="w-full bg-surface-overlay rounded-full h-1.5 mb-2">
                    <div
                      className="h-1.5 rounded-full bg-brand transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs font-numbers text-text-muted">
                    ${goal.currentAmountUsd.toFixed(2)} / ${goal.targetAmountUsd.toFixed(2)}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Gastos del periodo</h2>
        <div className="grid grid-cols-2 gap-4 stagger-children">
          <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total gastado" value={`$${data.totalUsd.toFixed(2)}`} unit="USD" detail={`${data.count} gastos`} accent="brand" />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Promedio diario" value={`$${data.avgDaily.toFixed(2)}`} unit="USD" detail={`${data.daysWithExpenses} dias con gastos`} accent="blue" />
          <StatCard icon={<ArrowUpRight className="h-4 w-4" />} label="Mayor gasto" value={data.biggestExpense ? `$${data.biggestExpense.amountUsd.toFixed(2)}` : "\u2014"} detail={data.biggestExpense?.merchant || "Sin gastos"} accent="amber" />
          <StatCard icon={<Star className="h-4 w-4" />} label="Categoria top" value={data.topCategory ? `${data.topCategory.emoji} ${data.topCategory.name}` : "\u2014"} detail={data.topCategory ? `$${data.topCategory.total.toFixed(2)} USD (${data.topCategory.count})` : "Sin datos"} accent="purple" />
        </div>
      </div>

      {/* Income vs Expenses Chart (6 months) */}
      {cashFlow && cashFlow.monthlyHistory.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Ingresos vs Gastos (6 meses)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashFlow.monthlyHistory}>
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => {
                    const [y, mo] = m.split("-");
                    return new Date(Number(y), Number(mo) - 1).toLocaleDateString("es-CO", { month: "short" });
                  }}
                  fontSize={11}
                  stroke="#5A6178"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis fontSize={11} stroke="#5A6178" tickLine={false} axisLine={false} />
                <Tooltip
                  labelFormatter={(m) => {
                    const [y, mo] = String(m).split("-");
                    return new Date(Number(y), Number(mo) - 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
                  }}
                  formatter={(value, name) => [
                    `$${Number(value ?? 0).toFixed(2)} USD`,
                    name === "income" ? "Ingresos" : name === "expenses" ? "Gastos" : "Balance",
                  ]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Legend
                  formatter={(value) =>
                    value === "income" ? "Ingresos" : value === "expenses" ? "Gastos" : "Balance"
                  }
                />
                <Bar dataKey="income" fill="#10B981" radius={[6, 6, 0, 0]} barSize={20} opacity={0.8} />
                <Bar dataKey="expenses" fill="#EF4444" radius={[6, 6, 0, 0]} barSize={20} opacity={0.8} />
                <Line dataKey="balance" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4, fill: "#3B82F6" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Charts */}
      {data.categoryDistribution.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Distribucion por categoria</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.categoryDistribution} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} strokeWidth={0}
                    label={(props) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}>
                    {data.categoryDistribution.map((entry, index) => (
                      <Cell key={entry.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${Number(value ?? 0).toFixed(2)} USD`}
                    contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Tendencia diaria</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyTrend}>
                  <XAxis dataKey="date" tickFormatter={(d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })} fontSize={11} stroke="#5A6178" tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} stroke="#5A6178" tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(d) => new Date(String(d) + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                    formatter={(value) => [`$${Number(value ?? 0).toFixed(2)} USD`, "Total"]}
                    contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="total" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* User Distribution (shared spaces only) */}
      {data.userDistribution && data.userDistribution.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-text-primary">Gastos por miembro</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.userDistribution} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} strokeWidth={0}
                    label={(props) => `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`}>
                    {data.userDistribution.map((entry, index) => (
                      <Cell key={entry.id} fill={USER_COLORS[index % USER_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${Number(value ?? 0).toFixed(2)} USD`}
                    contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center space-y-3">
              {data.userDistribution.map((user, index) => (
                <div key={user.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-raised/50">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: USER_COLORS[index % USER_COLORS.length] }} />
                    <span className="text-sm font-medium text-text-primary">{user.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-numbers text-text-primary">${user.total.toFixed(2)}</p>
                    <p className="text-xs text-text-muted">{user.count} gastos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data.count === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📊</span>
          </div>
          <p className="text-text-secondary text-lg font-medium">No hay gastos registrados</p>
          <p className="text-text-muted text-sm mt-2">Registra tu primer gasto desde la pagina de Gastos o via Telegram</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, unit, detail, accent }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; detail: string;
  accent: "brand" | "blue" | "amber" | "purple";
}) {
  const colors = {
    brand: "text-brand bg-brand/10",
    blue: "text-blue-400 bg-blue-400/10",
    amber: "text-amber-accent bg-amber-accent/10",
    purple: "text-purple-400 bg-purple-400/10",
  };
  return (
    <div className="glass-card glass-card-hover rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${colors[accent]}`}>{icon}</div>
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold font-numbers text-text-primary">
        {value}
        {unit && <span className="text-xs font-normal text-text-muted ml-1.5">{unit}</span>}
      </p>
      <p className="text-xs text-text-muted mt-1">{detail}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-8 w-40 bg-surface-raised" />
        <Skeleton className="h-4 w-60 mt-2 bg-surface-raised" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-5 space-y-3">
            <Skeleton className="h-4 w-24 bg-surface-overlay" />
            <Skeleton className="h-8 w-32 bg-surface-overlay" />
            <Skeleton className="h-3 w-20 bg-surface-overlay" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-5 space-y-3">
            <Skeleton className="h-4 w-24 bg-surface-overlay" />
            <Skeleton className="h-8 w-32 bg-surface-overlay" />
            <Skeleton className="h-3 w-20 bg-surface-overlay" />
          </div>
        ))}
      </div>
      <Skeleton className="h-80 rounded-2xl bg-surface-raised" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-80 rounded-2xl bg-surface-raised" />
        <Skeleton className="h-80 rounded-2xl bg-surface-raised" />
      </div>
    </div>
  );
}
