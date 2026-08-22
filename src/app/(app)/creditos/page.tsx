"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  Banknote,
  Landmark,
  Loader2,
  MoreHorizontal,
  Percent,
  Plus,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import type { LoanSummary, LoanTrackingMode, ScheduleRow } from "@/lib/loans";
import {
  LoanSchedule,
  MODE_HINTS,
  MODE_LABELS,
  MONTH_ABBR,
  formatMiles,
  formatPercent,
  monthLabelFromKey,
  parseAmountInput,
  shortMonthLabel,
  toEditString,
  toStoredMiles,
  type PeriodPatch,
} from "@/components/loans/LoanSchedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Loan {
  id: string;
  name: string;
  principal: number;
  monthlyRate: number;
  termMonths: number;
  startYear: number;
  startMonth: number;
  trackingMode: LoanTrackingMode;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

type LoanWithSummary = Loan & { summary: LoanSummary };

interface LoanDetail {
  loan: Loan;
  rows: ScheduleRow[];
  summary: LoanSummary;
}

interface ChartPoint {
  label: string;
  teorico: number;
  real: number;
}

const TOOLTIP_STYLE = {
  background: "rgba(20,23,32,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  color: "#F1F3F7",
  fontSize: "13px",
};

const CHART_THEORETICAL = "#3B82F6";
const CHART_REAL = "#10B981";

/* -------------------------------------------------------------------------- */
/*  Small presentational pieces                                                */
/* -------------------------------------------------------------------------- */

function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  hintClassName?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

function KpiCard({ label, value, hint, hintClassName, icon, children }: KpiCardProps) {
  return (
    <div className="glass-card glass-card-hover rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
        {icon}
      </div>
      <p className="mt-2 truncate font-numbers text-xl font-bold text-text-primary">
        {value}
      </p>
      {hint && (
        <p className={`mt-1 font-numbers text-xs ${hintClassName ?? "text-text-muted"}`}>
          {hint}
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function remainingLabel(summary: LoanSummary): string {
  if (summary.realBalance <= 0) return "Pagado";
  if (summary.periodsRemaining === null) return "—";
  return `${summary.periodsRemaining}`;
}

/* -------------------------------------------------------------------------- */
/*  Loan card                                                                  */
/* -------------------------------------------------------------------------- */

interface LoanCardProps {
  loan: LoanWithSummary;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function LoanCard({
  loan,
  selected,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
}: LoanCardProps) {
  const { summary } = loan;
  const remaining = remainingLabel(summary);
  return (
    <div
      className={`glass-card relative rounded-2xl p-4 transition-all ${
        selected
          ? "border-brand/60 ring-1 ring-brand/40"
          : "hover:border-border-default"
      } ${loan.isActive ? "" : "opacity-50"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Ver el credito ${loan.name}`}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
      />

      <div className="pointer-events-none relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {loan.name}
            </p>
            <Badge
              variant="outline"
              className="mt-1 border-border-subtle px-1.5 py-0 text-[9px] font-normal text-text-muted"
            >
              {MODE_LABELS[loan.trackingMode]}
            </Badge>
          </div>
          <div className="pointer-events-auto shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
                  aria-label={`Acciones de ${loan.name}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-border-subtle bg-surface-overlay"
              >
                <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
                <DropdownMenuItem onSelect={onToggle}>
                  {loan.isActive ? "Desactivar" : "Activar"}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border-subtle" />
                <DropdownMenuItem
                  className="text-red-accent focus:text-red-accent"
                  onSelect={onDelete}
                >
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-numbers text-2xl font-bold text-text-primary">
            {formatMiles(summary.realBalance)}
          </span>
          <span className="font-numbers text-xs text-text-muted">
            {formatPercent(summary.realBalancePercent)} del capital
          </span>
        </div>

        <div className="mt-3">
          <ProgressBar ratio={summary.paidPercent} />
          <p className="mt-1.5 font-numbers text-[11px] text-text-muted">
            Pagado {formatPercent(summary.paidPercent)}
          </p>
        </div>

        <p className="mt-3 font-numbers text-[11px] text-text-muted">
          Cuota {formatMiles(summary.cuota)} · {formatPercent(loan.monthlyRate, 2)} mes ·{" "}
          {loan.termMonths} meses
        </p>
        <p className="mt-1 text-[11px] text-text-secondary">
          {remaining === "Pagado" ? (
            <span className="font-semibold text-brand">Pagado</span>
          ) : (
            <>
              Meses restantes:{" "}
              <span className="font-numbers font-semibold text-text-primary">
                {remaining}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Balance chart                                                              */
/* -------------------------------------------------------------------------- */

const formatAxisMillions = (value: number): string => `${Math.round(value / 1e6)}M`;

function BalanceChart({ rows }: { rows: ScheduleRow[] }) {
  const data = useMemo<ChartPoint[]>(
    () =>
      rows.map((r) => ({
        label: shortMonthLabel(r.year, r.month),
        teorico: Math.round(r.theoreticalBalance),
        real: Math.round(r.realBalance),
      })),
    [rows]
  );
  const currentLabel = useMemo(() => {
    const row = rows.find((r) => r.isCurrent);
    return row ? shortMonthLabel(row.year, row.month) : null;
  }, [rows]);
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  return (
    <div className="glass-card rounded-2xl p-5">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">
        Saldo teorico vs saldo real
      </h2>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="loanReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_REAL} stopOpacity={0.35} />
                <stop offset="100%" stopColor={CHART_REAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              interval={tickInterval}
              fontSize={11}
              stroke="#5A6178"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              fontSize={11}
              stroke="#5A6178"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatAxisMillions}
              width={44}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [
                `${formatMiles(Number(value ?? 0))} miles`,
                name === "teorico" ? "Saldo teorico" : "Saldo real",
              ]}
            />
            <Legend
              formatter={(value) =>
                value === "teorico" ? "Saldo teorico" : "Saldo real"
              }
            />
            {currentLabel && (
              <ReferenceLine
                x={currentLabel}
                stroke="#5A6178"
                strokeDasharray="4 4"
                label={{ value: "Hoy", position: "top", fill: "#5A6178", fontSize: 10 }}
              />
            )}
            <Area
              dataKey="teorico"
              stroke={CHART_THEORETICAL}
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="none"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              dataKey="real"
              stroke={CHART_REAL}
              strokeWidth={2}
              fill="url(#loanReal)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function CreditosPage() {
  const [loans, setLoans] = useState<LoanWithSummary[]>([]);
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPrincipal, setFormPrincipal] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formTerm, setFormTerm] = useState("");
  const [formMonth, setFormMonth] = useState("1");
  const [formYear, setFormYear] = useState(String(new Date().getFullYear()));
  const [formMode, setFormMode] = useState<LoanTrackingMode>("SCHEDULE");
  const [formNotes, setFormNotes] = useState("");

  /* ---------------------------- Fetching --------------------------------- */

  const fetchLoans = useCallback(
    async (withSpinner: boolean): Promise<LoanWithSummary[]> => {
      if (withSpinner) setLoading(true);
      try {
        const params = showInactive ? "?includeInactive=true" : "";
        const result = await apiClient<{ loans: LoanWithSummary[] }>(
          `/api/loans${params}`
        );
        setLoans(result.loans);
        return result.loans;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cargar los creditos");
        return [];
      } finally {
        if (withSpinner) setLoading(false);
      }
    },
    [showInactive]
  );

  useEffect(() => {
    const load = async () => {
      const list = await fetchLoans(true);
      setSelectedId((prev) =>
        prev && list.some((l) => l.id === prev) ? prev : (list[0]?.id ?? null)
      );
    };
    void load();
  }, [fetchLoans]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setDetailLoading(true);
      try {
        const result = await apiClient<LoanDetail>(`/api/loans/${selectedId}`);
        if (!cancelled) setDetail(result);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          toast.error(err instanceof Error ? err.message : "Error al cargar el credito");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  /* ---------------------------- Mutations -------------------------------- */

  const savePeriod = useCallback(
    async (period: number, patch: PeriodPatch) => {
      if (!detail) return;
      const snapshot = detail;
      setSaving(true);
      // Optimistic: reflect the typed value while the server recomputes.
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.period === period ? { ...r, ...patch } : r
              ),
            }
          : prev
      );
      try {
        const result = await apiClient<LoanDetail>(
          `/api/loans/${snapshot.loan.id}/periods`,
          { method: "PUT", body: JSON.stringify({ period, ...patch }) }
        );
        setDetail(result);
        setLoans((prev) =>
          prev.map((l) =>
            l.id === result.loan.id ? { ...l, ...result.loan, summary: result.summary } : l
          )
        );
      } catch (err) {
        setDetail(snapshot);
        toast.error(err instanceof Error ? err.message : "Error al guardar el periodo");
      } finally {
        setSaving(false);
      }
    },
    [detail]
  );

  /* ------------------------- Loan CRUD ----------------------------------- */

  const resetForm = () => {
    setEditingLoan(null);
    setFormName("");
    setFormPrincipal("");
    setFormRate("");
    setFormTerm("");
    setFormMonth("1");
    setFormYear(String(new Date().getFullYear()));
    setFormMode("SCHEDULE");
    setFormNotes("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (loan: Loan) => {
    setEditingLoan(loan);
    setFormName(loan.name);
    setFormPrincipal(toEditString(loan.principal));
    setFormRate(
      (loan.monthlyRate * 100).toLocaleString("es-CO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })
    );
    setFormTerm(String(loan.termMonths));
    setFormMonth(String(loan.startMonth));
    setFormYear(String(loan.startYear));
    setFormMode(loan.trackingMode);
    setFormNotes(loan.notes ?? "");
    setDialogOpen(true);
  };

  const formRateValue = useMemo(() => {
    const parsed = parseAmountInput(formRate);
    return parsed === null ? null : parsed / 100;
  }, [formRate]);

  const formEffectiveAnnual = useMemo(() => {
    if (formRateValue === null || formRateValue < 0) return null;
    return Math.pow(1 + formRateValue, 12) - 1;
  }, [formRateValue]);

  const handleSubmitLoan = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = formName.trim();
    const parsedPrincipal = parseAmountInput(formPrincipal);
    const principal = parsedPrincipal === null ? null : toStoredMiles(parsedPrincipal);
    const termMonths = Number(formTerm);
    const startYear = Number(formYear);
    const startMonth = Number(formMonth);

    if (!name) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (principal === null || principal <= 0) {
      toast.error("El capital debe ser mayor a cero");
      return;
    }
    if (formRateValue === null || formRateValue < 0 || formRateValue > 1) {
      toast.error("La tasa mensual debe estar entre 0 y 100 %");
      return;
    }
    if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 600) {
      toast.error("El plazo debe ser un numero entero de meses (1 a 600)");
      return;
    }
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) {
      toast.error("El año del primer mes no es valido");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        name,
        principal,
        monthlyRate: formRateValue,
        termMonths,
        startYear,
        startMonth,
        trackingMode: formMode,
        notes: formNotes.trim() || null,
      };

      if (editingLoan) {
        await apiClient<LoanDetail>(`/api/loans/${editingLoan.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Credito actualizado");
        const list = await fetchLoans(false);
        if (list.some((l) => l.id === editingLoan.id)) setSelectedId(editingLoan.id);
      } else {
        const created = await apiClient<LoanWithSummary>("/api/loans", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Credito creado");
        await fetchLoans(false);
        setSelectedId(created.id);
      }
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el credito");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLoan = async (loan: Loan) => {
    try {
      await apiClient<LoanDetail>(`/api/loans/${loan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !loan.isActive }),
      });
      toast.success(loan.isActive ? "Credito desactivado" : "Credito activado");
      const list = await fetchLoans(false);
      if (!list.some((l) => l.id === selectedId)) setSelectedId(list[0]?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleDeleteLoan = async (loan: Loan) => {
    const ok = window.confirm(
      `Eliminar "${loan.name}" y todos sus periodos registrados? Esta accion no se puede deshacer.`
    );
    if (!ok) return;
    try {
      await apiClient(`/api/loans/${loan.id}`, { method: "DELETE" });
      toast.success("Credito eliminado");
      const list = await fetchLoans(false);
      if (selectedId === loan.id) setSelectedId(list[0]?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  /* ---------------------------- Render ----------------------------------- */

  const summary = detail?.summary ?? null;
  const selectedLoan = detail?.loan ?? null;

  return (
    <div className="max-w-full space-y-6 overflow-x-hidden animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Creditos</h1>
          <p className="mt-1 text-sm text-text-muted">
            Tabla de amortizacion y estado real de cada credito
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised/50 px-3 py-2">
            <Switch
              id="show-inactive-loans"
              checked={showInactive}
              onCheckedChange={setShowInactive}
              className="scale-75"
            />
            <Label htmlFor="show-inactive-loans" className="text-xs text-text-secondary">
              Mostrar inactivos
            </Label>
          </div>

          <Button
            size="sm"
            onClick={openCreate}
            className="h-10 rounded-xl bg-brand text-white hover:bg-brand-dark"
          >
            <Plus className="mr-1 h-4 w-4" />
            Nuevo credito
          </Button>
        </div>
      </div>

      {/* Loan cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : loans.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
            <Landmark className="h-8 w-8 text-brand" />
          </div>
          <p className="text-lg font-medium text-text-secondary">
            Aun no tienes creditos
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
            Registra el capital, la tasa mensual y el plazo: la tabla de amortizacion
            francesa se calcula sola y tu solo llevas el seguimiento real mes a mes.
          </p>
          <Button
            onClick={openCreate}
            className="mt-6 h-11 rounded-xl bg-brand text-white hover:bg-brand-dark"
          >
            <Plus className="mr-1 h-4 w-4" />
            Crear mi primer credito
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 stagger-children sm:grid-cols-2 xl:grid-cols-3">
          {loans.map((loan) => (
            <LoanCard
              key={loan.id}
              loan={loan}
              selected={loan.id === selectedId}
              onSelect={() => setSelectedId(loan.id)}
              onEdit={() => openEdit(loan)}
              onToggle={() => handleToggleLoan(loan)}
              onDelete={() => handleDeleteLoan(loan)}
            />
          ))}
        </div>
      )}

      {/* Detail */}
      {!loading && loans.length > 0 && (
        <>
          {detailLoading || !detail || !summary || !selectedLoan ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl bg-surface-raised" />
                ))}
              </div>
              <Skeleton className="h-[280px] rounded-2xl bg-surface-raised" />
              <Skeleton className="h-[420px] rounded-2xl bg-surface-raised" />
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 stagger-children md:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  label="Credito total"
                  value={formatMiles(selectedLoan.principal)}
                  hint={`${selectedLoan.termMonths} meses · desde ${shortMonthLabel(
                    selectedLoan.startYear,
                    selectedLoan.startMonth
                  )}`}
                  icon={<Landmark className="h-4 w-4 text-text-muted" />}
                />
                <KpiCard
                  label="Pagado hasta el momento"
                  value={formatMiles(summary.paidToDate)}
                  hint={`${formatPercent(
                    summary.paidPercent
                  )} · Desembolsado: ${formatMiles(summary.cashPaidToDate)}`}
                  hintClassName="text-brand"
                  icon={<Wallet className="h-4 w-4 text-brand" />}
                >
                  <ProgressBar ratio={summary.paidPercent} />
                </KpiCard>
                <KpiCard
                  label="Saldo real"
                  value={formatMiles(summary.realBalance)}
                  hint={`${formatPercent(
                    summary.realBalancePercent
                  )} · Teorico: ${formatMiles(summary.theoreticalBalanceNow)}`}
                  icon={<TrendingDown className="h-4 w-4 text-text-muted" />}
                />
                <KpiCard
                  label="Meses restantes"
                  value={remainingLabel(summary)}
                  hint={`Termina en ${monthLabelFromKey(
                    summary.payoffKey ?? summary.endKey
                  )}`}
                />
                <KpiCard
                  label="Intereses"
                  value={formatMiles(summary.projectedInterest)}
                  hint={`A la fecha ${formatMiles(
                    summary.interestToDate
                  )} · Plazo completo ${formatMiles(summary.totalInterest)}`}
                  icon={<Percent className="h-4 w-4 text-amber-accent" />}
                />
                <KpiCard
                  label="Cuota"
                  value={formatMiles(summary.cuota)}
                  hint={`EA ${formatPercent(summary.effectiveAnnualRate, 2)}`}
                  icon={<Banknote className="h-4 w-4 text-text-muted" />}
                />
              </div>

              <BalanceChart rows={detail.rows} />

              <LoanSchedule
                loanId={selectedLoan.id}
                rows={detail.rows}
                trackingMode={selectedLoan.trackingMode}
                saving={saving}
                onSave={savePeriod}
              />

              {selectedLoan.notes && (
                <p className="text-xs text-text-muted">{selectedLoan.notes}</p>
              )}
            </>
          )}
        </>
      )}

      {/* Dialog nuevo / editar credito */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="glass-card border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">
              {editingLoan ? "Editar credito" : "Nuevo credito"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitLoan} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-text-secondary">
                Nombre
              </Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Credito del apartamento"
                required
                className="h-11 rounded-xl border-border-subtle bg-surface-raised/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-text-secondary">
                  Capital (miles)
                </Label>
                <Input
                  value={formPrincipal}
                  onChange={(e) => setFormPrincipal(e.target.value)}
                  inputMode="decimal"
                  placeholder="240000"
                  required
                  className="h-11 rounded-xl border-border-subtle bg-surface-raised/50 font-numbers"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-text-secondary">
                  Tasa mensual (%)
                </Label>
                <Input
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  inputMode="decimal"
                  placeholder="1,10"
                  required
                  className="h-11 rounded-xl border-border-subtle bg-surface-raised/50 font-numbers"
                />
                <p className="font-numbers text-[11px] text-text-muted">
                  {formEffectiveAnnual === null
                    ? "EA —"
                    : `EA ${formatPercent(formEffectiveAnnual, 2)}`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-text-secondary">
                  Plazo (meses)
                </Label>
                <Input
                  value={formTerm}
                  onChange={(e) => setFormTerm(e.target.value)}
                  inputMode="numeric"
                  placeholder="60"
                  required
                  className="h-11 rounded-xl border-border-subtle bg-surface-raised/50 font-numbers"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-text-secondary">
                  Primer mes
                </Label>
                <Select value={formMonth} onValueChange={setFormMonth}>
                  <SelectTrigger className="h-11 rounded-xl border-border-subtle bg-surface-raised/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border-subtle bg-surface-overlay">
                    {MONTH_ABBR.map((abbr, idx) => (
                      <SelectItem key={abbr} value={String(idx + 1)}>
                        {abbr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-text-secondary">
                  Año
                </Label>
                <Input
                  value={formYear}
                  onChange={(e) => setFormYear(e.target.value)}
                  inputMode="numeric"
                  placeholder="2025"
                  required
                  className="h-11 rounded-xl border-border-subtle bg-surface-raised/50 font-numbers"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-text-secondary">
                Modo de seguimiento
              </Label>
              <Select
                value={formMode}
                onValueChange={(v) => setFormMode(v as LoanTrackingMode)}
              >
                <SelectTrigger className="h-11 rounded-xl border-border-subtle bg-surface-raised/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border-subtle bg-surface-overlay">
                  {(Object.keys(MODE_LABELS) as LoanTrackingMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-text-muted">{MODE_HINTS[formMode]}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-text-secondary">
                Notas (opcional)
              </Label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Ej: credito del empleador, se descuenta de nomina"
                className="h-11 rounded-xl border-border-subtle bg-surface-raised/50"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="h-11 w-full rounded-xl bg-brand font-semibold text-white hover:bg-brand-dark"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingLoan ? (
                "Guardar cambios"
              ) : (
                "Crear credito"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
