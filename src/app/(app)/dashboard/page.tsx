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
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, ArrowUpRight, Star, Users, Wallet, CalendarCheck, Target, PiggyBank, Sparkles, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface DashboardData {
  total: number;
  totalUsd: number;
  currency: "COP" | "USD";
  copRate: number;
  count: number;
  avgDaily: number;
  daysWithExpenses: number;
  biggestExpense: { merchant: string; amount: number } | null;
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
  const [insights, setInsights] = useState<string[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [selectedSpace, setSelectedSpace] = useState("all");
  const [period, setPeriod] = useState("month");
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "COP">("USD");

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSpace !== "all") params.set("spaceId", selectedSpace);
      params.set("period", period);
      params.set("currency", displayCurrency);

      const [dashResult, cfResult, atsResult] = await Promise.all([
        apiClient<DashboardData>(`/api/dashboard?${params.toString()}`),
        apiClient<CashFlowData>("/api/cashflow"),
        apiClient<AvailableToSpendData>("/api/available-to-spend").catch(() => null),
      ]);
      setData(dashResult);
      setCashFlow(cfResult);
      setAvailableData(atsResult);
      // Fetch insights (non-blocking)
      apiClient<{ insights: string[] }>("/api/insights").then((r) => setInsights(r.insights)).catch(() => {});
    } catch (err) {
      console.error("Error fetching dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSpace, period, displayCurrency]);

  useEffect(() => {
    apiClient<{ spaces: SpaceInfo[] }>("/api/spaces").then((res) => {
      setSpaces(res.spaces);
    });
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF();
      const now = new Date();
      const monthLabel = now.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
      const generatedDate = now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

      // Helper to check if we need a new page
      const checkPageBreak = (currentY: number, needed: number = 30): number => {
        if (currentY + needed > 275) {
          doc.addPage();
          return 20;
        }
        return currentY;
      };

      // --- 1. Header ---
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 0, 210, 35, "F");
      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.text("Reporte Financiero Mensual", 14, 18);
      doc.setFontSize(10);
      doc.text(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), 14, 26);
      doc.setFontSize(8);
      doc.setTextColor(220, 255, 240);
      doc.text(`Generado: ${generatedDate}`, 14, 32);

      let y = 45;

      // --- 2. Cash Flow Summary ---
      if (cashFlow) {
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.text("Resumen de Flujo de Caja", 14, y);
        y += 2;
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.line(14, y, 196, y);
        y += 8;

        doc.setFontSize(10);
        doc.setTextColor(60);

        const summaryItems = [
          { label: "Ingresos mensuales", value: `$${cashFlow.monthlyIncome.toFixed(2)} USD` },
          { label: "Gastos este mes", value: `$${cashFlow.monthlyExpenses.toFixed(2)} USD` },
          { label: "Balance", value: `$${cashFlow.balance.toFixed(2)} USD` },
          { label: "Tasa de ahorro", value: `${cashFlow.savingsRate.toFixed(1)}%` },
          { label: "Disponible por dia", value: `$${cashFlow.dailyAvailable.toFixed(2)} USD` },
        ];

        summaryItems.forEach((item) => {
          doc.setTextColor(100);
          doc.text(item.label + ":", 14, y);
          doc.setTextColor(30);
          doc.text(item.value, 80, y);
          y += 6;
        });

        y += 6;
      }

      // --- 3. Category Table ---
      if (data && data.categoryDistribution.length > 0) {
        y = checkPageBreak(y, 40);
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.text("Desglose por Categoria", 14, y);
        y += 2;
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.line(14, y, 196, y);
        y += 4;

        const totalExpenses = data.categoryDistribution.reduce((sum, c) => sum + c.total, 0);
        autoTable(doc, {
          startY: y,
          head: [["", "Categoria", "Total USD", "Transacciones", "% del Total"]],
          body: data.categoryDistribution.map((c) => [
            c.emoji,
            c.name,
            `$${c.total.toFixed(2)}`,
            String(c.count),
            `${totalExpenses > 0 ? ((c.total / totalExpenses) * 100).toFixed(1) : "0"}%`,
          ]),
          theme: "striped",
          headStyles: { fillColor: [16, 185, 129], fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 12, halign: "center" },
            2: { halign: "right" },
            3: { halign: "center" },
            4: { halign: "right" },
          },
          foot: [["", "TOTAL", `$${totalExpenses.toFixed(2)}`, String(data.categoryDistribution.reduce((s, c) => s + c.count, 0)), "100%"]],
          footStyles: { fillColor: [240, 240, 240], textColor: [30, 30, 30], fontStyle: "bold", fontSize: 9 },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      }

      // --- 4. Daily Trend Summary ---
      if (data && data.dailyTrend.length > 0) {
        y = checkPageBreak(y, 40);
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.text("Tendencia Diaria de Gastos", 14, y);
        y += 2;
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.line(14, y, 196, y);
        y += 8;

        const dailyTotals = data.dailyTrend.filter((d) => d.total > 0);
        const maxDay = dailyTotals.reduce((max, d) => (d.total > max.total ? d : max), dailyTotals[0] || { date: "", total: 0 });
        const avgDaily = dailyTotals.length > 0 ? dailyTotals.reduce((s, d) => s + d.total, 0) / dailyTotals.length : 0;

        doc.setFontSize(10);
        doc.setTextColor(60);
        doc.text(`Dias con gastos: ${dailyTotals.length} de ${data.dailyTrend.length}`, 14, y); y += 6;
        doc.text(`Promedio diario (dias con gasto): $${avgDaily.toFixed(2)} USD`, 14, y); y += 6;
        if (maxDay && maxDay.date) {
          const maxDate = new Date(maxDay.date + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
          doc.text(`Dia con mayor gasto: ${maxDate} - $${maxDay.total.toFixed(2)} USD`, 14, y); y += 6;
        }

        // Text-based bar chart for top 10 days
        y += 2;
        const topDays = [...dailyTotals].sort((a, b) => b.total - a.total).slice(0, 10);
        const maxTotal = topDays.length > 0 ? topDays[0].total : 1;
        doc.setFontSize(8);
        topDays.forEach((day) => {
          y = checkPageBreak(y, 8);
          const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
          const barWidth = Math.max((day.total / maxTotal) * 100, 2);
          doc.setTextColor(80);
          doc.text(dateLabel, 14, y);
          doc.setFillColor(16, 185, 129);
          doc.rect(40, y - 3, barWidth, 3.5, "F");
          doc.setTextColor(60);
          doc.text(`$${day.total.toFixed(2)}`, 145, y);
          y += 5.5;
        });
        y += 6;
      }

      // --- 5. Savings Goals ---
      if (availableData && availableData.activeGoals.length > 0) {
        y = checkPageBreak(y, 40);
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.text("Metas de Ahorro", 14, y);
        y += 2;
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.line(14, y, 196, y);
        y += 4;

        autoTable(doc, {
          startY: y,
          head: [["", "Meta", "Progreso", "Actual", "Objetivo"]],
          body: availableData.activeGoals.map((goal) => {
            const progress = goal.targetAmountUsd > 0
              ? Math.min((goal.currentAmountUsd / goal.targetAmountUsd) * 100, 100)
              : 0;
            return [
              goal.icon,
              goal.name,
              `${progress.toFixed(1)}%`,
              `$${goal.currentAmountUsd.toFixed(2)}`,
              `$${goal.targetAmountUsd.toFixed(2)}`,
            ];
          }),
          theme: "striped",
          headStyles: { fillColor: [139, 92, 246], fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 12, halign: "center" },
            2: { halign: "center" },
            3: { halign: "right" },
            4: { halign: "right" },
          },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      }

      // --- 6. AI Insights ---
      if (insights.length > 0) {
        y = checkPageBreak(y, 30);
        doc.setFontSize(14);
        doc.setTextColor(16, 185, 129);
        doc.text("Insights de IA", 14, y);
        y += 2;
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.line(14, y, 196, y);
        y += 8;

        doc.setFontSize(10);
        doc.setTextColor(60);
        insights.forEach((insight) => {
          y = checkPageBreak(y, 12);
          const lines = doc.splitTextToSize(`\u2022 ${insight}`, 175);
          doc.text(lines, 18, y);
          y += lines.length * 5 + 4;
        });
        y += 4;
      }

      // --- 7. Recent Expenses Table ---
      try {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const expensesForPdf = await apiClient<{ expenses: { merchant: string; amount: number; currency: string; amountUsd: number; category: { emoji: string; name: string }; createdAt: string }[] }>("/api/expenses?limit=30&dateFrom=" + monthStart);

        if (expensesForPdf.expenses && expensesForPdf.expenses.length > 0) {
          y = checkPageBreak(y, 40);
          doc.setFontSize(14);
          doc.setTextColor(16, 185, 129);
          doc.text("Ultimos Gastos del Mes", 14, y);
          y += 2;
          doc.setDrawColor(16, 185, 129);
          doc.setLineWidth(0.5);
          doc.line(14, y, 196, y);
          y += 4;

          autoTable(doc, {
            startY: y,
            head: [["Comercio", "Monto", "Moneda", "USD", "Categoria", "Fecha"]],
            body: expensesForPdf.expenses.map((e) => [
              e.merchant.length > 22 ? e.merchant.substring(0, 22) + "..." : e.merchant,
              e.currency === "COP"
                ? `$${Math.round(e.amount).toLocaleString("es-CO")}`
                : `$${e.amount.toFixed(2)}`,
              e.currency,
              `$${e.amountUsd.toFixed(2)}`,
              `${e.category.emoji} ${e.category.name}`,
              new Date(e.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
            ]),
            theme: "striped",
            headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
              0: { cellWidth: 45 },
              1: { halign: "right", cellWidth: 28 },
              2: { halign: "center", cellWidth: 15 },
              3: { halign: "right", cellWidth: 22 },
              4: { cellWidth: 38 },
              5: { halign: "center", cellWidth: 22 },
            },
            margin: { left: 14, right: 14 },
          });
        }
      } catch (expErr) {
        console.error("Error fetching expenses for PDF:", expErr);
      }

      // --- Footer ---
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(160);
        doc.text(`MisGastos.app - Reporte generado automaticamente | Pagina ${i} de ${pageCount}`, 14, 290);
      }

      doc.save(`reporte-financiero-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.pdf`);
      toast.success("Reporte PDF descargado");
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Error al generar PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const cur = displayCurrency;
  const copRate = data?.copRate || 4200;
  const toCur = (usd: number) => cur === "COP" ? Math.round(usd * copRate) : Math.round(usd * 100) / 100;
  const fmtAmount = (v: number) =>
    cur === "COP" ? `$${v.toLocaleString("es-CO")}` : `$${v.toFixed(2)}`;
  const fmtUsd = (usd: number) => fmtAmount(toCur(usd));

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-muted mt-1">Resumen de tus finanzas</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          disabled={pdfLoading}
          className="border-brand/20 text-brand hover:bg-brand/10"
        >
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
          PDF
        </Button>
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

        <Tabs value={displayCurrency} onValueChange={(v) => setDisplayCurrency(v as "USD" | "COP")}>
          <TabsList className="bg-surface-raised border border-border-subtle">
            <TabsTrigger value="USD" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand text-xs">USD</TabsTrigger>
            <TabsTrigger value="COP" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand text-xs">COP</TabsTrigger>
          </TabsList>
        </Tabs>
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
                {fmtUsd(cashFlow.balance)}
                <span className="text-xs font-normal text-text-muted ml-1.5">{cur}</span>
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
                {fmtUsd(cashFlow.dailyAvailable)}
                <span className="text-xs font-normal text-text-muted ml-1.5">{cur}</span>
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
                {fmtUsd(cashFlow.monthlyIncome)}
                <span className="text-xs font-normal text-text-muted ml-1.5">{cur}/mes</span>
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
                {fmtUsd(cashFlow.lastMonthExpenses)}
                <span className="text-xs font-normal text-text-muted ml-1.5">{cur}</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                {(cashFlow.lastMonthRatio * 100).toFixed(0)}% de ingresos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AI Insights */}
      {insights.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg text-purple-400 bg-purple-400/10">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">Insights</h3>
          </div>
          <div className="space-y-2.5">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                <p className="text-sm text-text-secondary">{insight}</p>
              </div>
            ))}
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
                {fmtUsd(availableData.availableToSpend)}
                <span className="text-xs font-normal text-text-muted ml-1.5">{cur}</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                {fmtUsd(availableData.dailyBudget)}/dia · {availableData.daysRemaining}d restantes
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
                {fmtUsd(availableData.monthlySavings)}
                <span className="text-xs font-normal text-text-muted ml-1.5">este mes</span>
              </p>
              <p className="text-xs text-text-muted mt-1">
                {fmtUsd(availableData.totalSavingsCommitted)} por completar
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
                    {fmtUsd(goal.currentAmountUsd)} / {fmtUsd(goal.targetAmountUsd)}
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
          <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total gastado" value={fmtAmount(data.total)} unit={cur} detail={`${data.count} gastos`} accent="brand" />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Promedio diario" value={fmtAmount(data.avgDaily)} unit={cur} detail={`${data.daysWithExpenses} dias con gastos`} accent="blue" />
          <StatCard icon={<ArrowUpRight className="h-4 w-4" />} label="Mayor gasto" value={data.biggestExpense ? fmtAmount(data.biggestExpense.amount) : "\u2014"} detail={data.biggestExpense?.merchant || "Sin gastos"} accent="amber" />
          <StatCard icon={<Star className="h-4 w-4" />} label="Categoria top" value={data.topCategory ? `${data.topCategory.emoji} ${data.topCategory.name}` : "\u2014"} detail={data.topCategory ? `${fmtAmount(data.topCategory.total)} ${cur} (${data.topCategory.count})` : "Sin datos"} accent="purple" />
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
                    `${fmtUsd(Number(value ?? 0))} ${cur}`,
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
                  <Tooltip formatter={(value) => `${fmtAmount(Number(value ?? 0))} ${cur}`}
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
                    formatter={(value) => [`${fmtAmount(Number(value ?? 0))} ${cur}`, "Total"]}
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
                  <Tooltip formatter={(value) => `${fmtAmount(Number(value ?? 0))} ${cur}`}
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
                    <p className="text-sm font-bold font-numbers text-text-primary">{fmtAmount(user.total)}</p>
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
