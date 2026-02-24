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
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DollarSign, TrendingUp, ArrowUpRight, Star } from "lucide-react";

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
}

interface SpaceInfo {
  id: string;
  name: string;
}

const CHART_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444", "#EC4899", "#14B8A6", "#F97316", "#6366F1"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
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

      const result = await apiClient<DashboardData>(
        `/api/dashboard?${params.toString()}`
      );
      setData(result);
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
        <p className="text-sm text-text-muted mt-1">Resumen de tus gastos</p>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 stagger-children">
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total gastado" value={`$${data.totalUsd.toFixed(2)}`} unit="USD" detail={`${data.count} gastos`} accent="brand" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Promedio diario" value={`$${data.avgDaily.toFixed(2)}`} unit="USD" detail={`${data.daysWithExpenses} dias con gastos`} accent="blue" />
        <StatCard icon={<ArrowUpRight className="h-4 w-4" />} label="Mayor gasto" value={data.biggestExpense ? `$${data.biggestExpense.amountUsd.toFixed(2)}` : "—"} detail={data.biggestExpense?.merchant || "Sin gastos"} accent="amber" />
        <StatCard icon={<Star className="h-4 w-4" />} label="Categoria top" value={data.topCategory ? `${data.topCategory.emoji} ${data.topCategory.name}` : "—"} detail={data.topCategory ? `$${data.topCategory.total.toFixed(2)} USD (${data.topCategory.count})` : "Sin datos"} accent="purple" />
      </div>

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
                    contentStyle={{ background: "rgba(20,23,32,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", color: "#F1F3F7", fontSize: "13px" }} />
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
                    contentStyle={{ background: "rgba(20,23,32,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", color: "#F1F3F7", fontSize: "13px" }} />
                  <Bar dataKey="total" fill="#10B981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-2xl p-5 space-y-3">
            <Skeleton className="h-4 w-24 bg-surface-overlay" />
            <Skeleton className="h-8 w-32 bg-surface-overlay" />
            <Skeleton className="h-3 w-20 bg-surface-overlay" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-80 rounded-2xl bg-surface-raised" />
        <Skeleton className="h-80 rounded-2xl bg-surface-raised" />
      </div>
    </div>
  );
}
