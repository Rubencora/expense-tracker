"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  DEBT_KIND_LABELS,
  addMonths,
  monthKey,
  parseMonthKey,
  type DebtCell,
  type DebtKind,
  type MonthColumn,
  type MonthSummary,
} from "@/lib/debts";
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
import { toast } from "sonner";
import {
  CreditCard,
  Loader2,
  MoreHorizontal,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type Unit = "miles" | "pesos";
type RangeOption = "6" | "12" | "24" | "all";
type Currency = "COP" | "USD";
type EntryField = "balance" | "payment";
type ParamField = "salary" | "extraIncome" | "trm";

interface Debt {
  id: string;
  name: string;
  kind: DebtKind;
  currency: Currency;
  creditLimit: number | null;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
}

interface BalanceResponse {
  from: { year: number; month: number };
  to: { year: number; month: number };
  debts: Debt[];
  columns: MonthColumn[];
  fallbackTrm: number;
  earliest: { year: number; month: number } | null;
}

/* -------------------------------------------------------------------------- */
/*  Formatting / parsing helpers                                               */
/* -------------------------------------------------------------------------- */

const MONTH_ABBR = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const EMPTY_CELL: DebtCell = {
  balance: 0,
  payment: 0,
  balanceCop: 0,
  paymentCop: 0,
  note: null,
  exists: false,
};

function monthLabel(year: number, month: number): string {
  return `${MONTH_ABBR[month - 1]} ${String(year % 100).padStart(2, "0")}`;
}

function formatCop(value: number, unit: Unit): string {
  if (unit === "miles") return Math.round(value / 1000).toLocaleString("es-CO");
  return value.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value: number, currency: Currency, unit: Unit): string {
  return currency === "USD" ? formatUsd(value) : formatCop(value, unit);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/**
 * Accepts `1.234.567`, `4862`, `4,5`, `$ 4.862`.
 * A single dot followed by exactly three digits is read as a COP thousands
 * separator (same rule the rest of the app uses for COP amounts).
 */
function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s$]/g, "").replace(/[^0-9.,-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;

  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = cleaned.split(".").length - 1;
    if (dots > 1 || /\.\d{3}$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Converts a typed value into the stored full-unit amount. */
function toStored(value: number, currency: Currency, unit: Unit): number {
  if (currency === "USD") return Math.round(value * 100) / 100;
  return unit === "miles" ? Math.round(value * 1000) : Math.round(value);
}

/** Converts a stored amount into the string shown while editing. */
function toEditString(value: number, currency: Currency, unit: Unit): string {
  if (value === 0) return "";
  if (currency === "USD") return String(Math.round(value * 100) / 100);
  if (unit === "miles") return String(Number((value / 1000).toFixed(3)));
  return String(Math.round(value));
}

/* -------------------------------------------------------------------------- */
/*  Editable amount cell                                                       */
/* -------------------------------------------------------------------------- */

interface EditableAmountProps {
  active: boolean;
  display: string;
  initial: string;
  align?: "left" | "right";
  dim?: boolean;
  title?: string;
  textClassName?: string;
  onActivate: () => void;
  onCancel: () => void;
  onCommit: (raw: string) => void;
}

function EditableAmount({
  active,
  display,
  initial,
  align = "right",
  dim = false,
  title,
  textClassName,
  onActivate,
  onCancel,
  onCommit,
}: EditableAmountProps) {
  const [draft, setDraft] = useState(initial);
  const initialRef = useRef(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  // Kept in a ref so a background refetch does not clobber the in-progress draft.
  useEffect(() => {
    initialRef.current = initial;
  }, [initial]);

  useEffect(() => {
    if (!active) return;
    setDraft(initialRef.current);
    cancelledRef.current = false;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  const base = `h-8 w-full ${
    align === "right" ? "text-right" : "text-left"
  } px-2 rounded-md font-numbers text-xs tabular-nums leading-8 transition-colors`;

  const commit = () => {
    if (cancelledRef.current) return;
    onCancel();
    if (draft.trim() === initialRef.current.trim()) return;
    onCommit(draft);
  };

  if (active) {
    return (
      <input
        ref={inputRef}
        value={draft}
        inputMode="decimal"
        title={title}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelledRef.current = true;
            onCancel();
          }
        }}
        className={`${base} bg-surface-overlay border border-brand/60 text-text-primary outline-none`}
      />
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onActivate}
      onFocus={onActivate}
      className={`${base} border border-transparent hover:border-border-default hover:bg-surface-raised/60 focus:outline-none focus:border-brand/60 ${
        dim ? "text-text-muted" : textClassName ?? "text-text-secondary"
      }`}
    >
      {display}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small presentational pieces                                                */
/* -------------------------------------------------------------------------- */

function UsageBar({ ratio }: { ratio: number | null }) {
  const pct = ratio === null ? 0 : Math.max(0, Math.min(1, ratio)) * 100;
  const danger = ratio !== null && ratio > 0.9;
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-overlay overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          danger ? "bg-red-accent" : "bg-brand"
        }`}
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
      <p className="mt-2 text-xl font-bold font-numbers text-text-primary truncate">
        {value}
      </p>
      {hint && (
        <p className={`mt-1 text-xs font-numbers ${hintClassName ?? "text-text-muted"}`}>
          {hint}
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DeudasPage() {
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<RangeOption>("12");
  const [unit, setUnit] = useState<Unit>("miles");
  const [showInactive, setShowInactive] = useState(false);
  const [earliestKey, setEarliestKey] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<string | null>(null);

  // Debt dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formKind, setFormKind] = useState<DebtKind>("CREDIT_CARD");
  const [formCurrency, setFormCurrency] = useState<Currency>("COP");
  const [formLimit, setFormLimit] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const currentKey = useMemo(() => {
    const now = new Date();
    return monthKey(now.getFullYear(), now.getMonth() + 1);
  }, []);

  const fetchBalance = useCallback(
    async (withSpinner: boolean) => {
      if (withSpinner) setLoading(true);
      try {
        const now = new Date();
        const to = { year: now.getFullYear(), month: now.getMonth() + 1 };
        const toIdx = to.year * 12 + to.month;

        let from = addMonths(to.year, to.month, -(Number(range) - 1) || -11);
        if (range === "all") {
          const parsed = earliestKey ? parseMonthKey(earliestKey) : null;
          const candidate = parsed ?? addMonths(to.year, to.month, -23);
          from = candidate.year * 12 + candidate.month > toIdx ? to : candidate;
        }

        const params = new URLSearchParams({
          from: monthKey(from.year, from.month),
          to: monthKey(to.year, to.month),
        });
        if (showInactive) params.set("includeInactive", "true");

        const result = await apiClient<BalanceResponse>(
          `/api/debts/balance?${params.toString()}`
        );
        setData(result);
        setEarliestKey(
          result.earliest ? monthKey(result.earliest.year, result.earliest.month) : null
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cargar el balance");
      } finally {
        if (withSpinner) setLoading(false);
      }
    },
    [range, showInactive, earliestKey]
  );

  useEffect(() => {
    fetchBalance(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, showInactive]);

  const columns = useMemo(() => data?.columns ?? [], [data]);
  const debts = useMemo(() => data?.debts ?? [], [data]);
  const latest: MonthSummary | null =
    columns.length > 0 ? columns[columns.length - 1].summary : null;
  const latestColumn: MonthColumn | null =
    columns.length > 0 ? columns[columns.length - 1] : null;

  /* ---------------------------- Mutations -------------------------------- */

  const saveEntry = useCallback(
    async (debt: Debt, column: MonthColumn, field: EntryField, raw: string) => {
      const parsed = parseAmountInput(raw);
      const value = parsed === null ? 0 : toStored(parsed, debt.currency, unit);
      if (value < 0) {
        toast.error("Los saldos y pagos no pueden ser negativos");
        return;
      }

      const snapshot = data;
      setSaving(true);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) =>
            col.key === column.key
              ? {
                  ...col,
                  cells: {
                    ...col.cells,
                    [debt.id]: {
                      ...(col.cells[debt.id] ?? EMPTY_CELL),
                      [field]: value,
                      exists: true,
                    },
                  },
                }
              : col
          ),
        };
      });

      try {
        await apiClient("/api/debts/entries", {
          method: "PUT",
          body: JSON.stringify({
            debtId: debt.id,
            year: column.year,
            month: column.month,
            [field]: value,
          }),
        });
        await fetchBalance(false);
      } catch (err) {
        setData(snapshot);
        toast.error(err instanceof Error ? err.message : "Error al guardar el valor");
      } finally {
        setSaving(false);
      }
    },
    [data, unit, fetchBalance]
  );

  const saveMonthParam = useCallback(
    async (column: MonthColumn, field: ParamField, raw: string) => {
      const parsed = parseAmountInput(raw);
      let value: number | null;

      if (field === "trm") {
        value = parsed;
        if (value !== null && value <= 0) {
          toast.error("La TRM debe ser mayor a cero");
          return;
        }
      } else {
        value = parsed === null ? 0 : toStored(parsed, "COP", unit);
        if (field === "salary" && value < 0) {
          toast.error("El sueldo no puede ser negativo");
          return;
        }
      }

      const snapshot = data;
      setSaving(true);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) =>
            col.key === column.key
              ? { ...col, params: { ...col.params, [field]: value } }
              : col
          ),
        };
      });

      try {
        await apiClient("/api/debts/months", {
          method: "PUT",
          body: JSON.stringify({
            year: column.year,
            month: column.month,
            [field]: value,
          }),
        });
        await fetchBalance(false);
      } catch (err) {
        setData(snapshot);
        toast.error(err instanceof Error ? err.message : "Error al guardar el parametro");
      } finally {
        setSaving(false);
      }
    },
    [data, unit, fetchBalance]
  );

  /* ------------------------- Debt CRUD ----------------------------------- */

  const resetForm = () => {
    setEditingDebt(null);
    setFormName("");
    setFormKind("CREDIT_CARD");
    setFormCurrency("COP");
    setFormLimit("");
    setFormNotes("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (debt: Debt) => {
    setEditingDebt(debt);
    setFormName(debt.name);
    setFormKind(debt.kind);
    setFormCurrency(debt.currency);
    setFormLimit(
      debt.creditLimit ? toEditString(debt.creditLimit, debt.currency, unit) : ""
    );
    setFormNotes(debt.notes ?? "");
    setDialogOpen(true);
  };

  const handleSubmitDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLimit = parseAmountInput(formLimit);
    const creditLimit =
      parsedLimit === null ? null : toStored(parsedLimit, formCurrency, unit);

    setSubmitting(true);
    try {
      const body = {
        name: formName.trim(),
        kind: formKind,
        currency: formCurrency,
        creditLimit,
        notes: formNotes.trim() || null,
      };

      if (editingDebt) {
        await apiClient<Debt>(`/api/debts/${editingDebt.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Deuda actualizada");
      } else {
        await apiClient<Debt>("/api/debts", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Deuda creada");
      }
      setDialogOpen(false);
      resetForm();
      await fetchBalance(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar la deuda");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDebt = async (debt: Debt) => {
    try {
      await apiClient<Debt>(`/api/debts/${debt.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !debt.isActive }),
      });
      toast.success(debt.isActive ? "Deuda desactivada" : "Deuda activada");
      await fetchBalance(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleDeleteDebt = async (debt: Debt) => {
    const ok = window.confirm(
      `Eliminar "${debt.name}" y todos sus saldos y pagos registrados? Esta accion no se puede deshacer.`
    );
    if (!ok) return;
    try {
      await apiClient(`/api/debts/${debt.id}`, { method: "DELETE" });
      toast.success("Deuda eliminada");
      await fetchBalance(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  /* ---------------------------- Derived ---------------------------------- */

  const cards = useMemo(
    () =>
      debts.filter(
        (d) => d.kind === "CREDIT_CARD" && d.creditLimit !== null && d.creditLimit > 0
      ),
    [debts]
  );

  const unitLabel = unit === "miles" ? "miles" : "pesos";

  /* ---------------------------- Render ----------------------------------- */

  return (
    <div className="space-y-6 animate-fade-in max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Balance de deudas
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Saldos y pagos mes a mes, como en tu Excel
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised/50 px-3 py-2">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
              className="scale-75"
            />
            <Label htmlFor="show-inactive" className="text-xs text-text-secondary">
              Mostrar inactivas
            </Label>
          </div>

          <div className="flex rounded-xl border border-border-subtle bg-surface-raised/50 p-1">
            {(["miles", "pesos"] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  unit === u
                    ? "bg-brand text-white"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {u === "miles" ? "Miles" : "Pesos"}
              </button>
            ))}
          </div>

          <Select value={range} onValueChange={(v) => setRange(v as RangeOption)}>
            <SelectTrigger className="h-10 w-[130px] rounded-xl border-border-subtle bg-surface-raised/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border-subtle bg-surface-overlay">
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
              <SelectItem value="24">24 meses</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={openCreate}
            className="h-10 rounded-xl bg-brand text-white hover:bg-brand-dark"
          >
            <Plus className="mr-1 h-4 w-4" />
            Nueva deuda
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : latest ? (
        <div className="grid grid-cols-1 gap-3 stagger-children sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label={`Deuda total · ${monthLabel(latest.year, latest.month)}`}
            value={formatCop(latest.totalDebt, unit)}
            hint={
              latest.debtDelta === null
                ? `en ${unitLabel}`
                : `${latest.debtDelta <= 0 ? "▼" : "▲"} ${formatCop(
                    Math.abs(latest.debtDelta),
                    unit
                  )} vs mes anterior`
            }
            hintClassName={
              latest.debtDelta === null
                ? undefined
                : latest.debtDelta <= 0
                  ? "text-brand"
                  : "text-red-accent"
            }
            icon={
              latest.debtDelta !== null && latest.debtDelta <= 0 ? (
                <TrendingDown className="h-4 w-4 text-brand" />
              ) : (
                <TrendingUp className="h-4 w-4 text-red-accent" />
              )
            }
          />
          <KpiCard
            label="Pagos del mes"
            value={formatCop(latest.totalPayments, unit)}
            hint={`en ${unitLabel}`}
          />
          <KpiCard
            label="Ingresos"
            value={formatCop(latest.income, unit)}
            hint={`Sueldo ${formatCop(latest.salary, unit)} · Extra ${formatCop(
              latest.extraIncome,
              unit
            )}`}
          />
          <KpiCard
            label="Diferencia"
            value={formatCop(latest.difference, unit)}
            hint={
              latest.difference >= 0 ? "Ingresos cubren la deuda" : "Deuda supera ingresos"
            }
            hintClassName={latest.difference >= 0 ? "text-brand" : "text-red-accent"}
          />
          <KpiCard
            label="Consumo TC"
            value={formatPercent(latest.cardUsage)}
            hint={
              latest.cardLimit > 0
                ? `${formatCop(latest.cardBalance, unit)} de ${formatCop(
                    latest.cardLimit,
                    unit
                  )}`
                : "Sin cupos registrados"
            }
            icon={<CreditCard className="h-4 w-4 text-text-muted" />}
          >
            {latest.cardLimit > 0 && <UsageBar ratio={latest.cardUsage} />}
          </KpiCard>
        </div>
      ) : null}

      {/* Grid */}
      {loading ? (
        <Skeleton className="h-[420px] rounded-2xl bg-surface-raised" />
      ) : debts.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
            <Scale className="h-8 w-8 text-brand" />
          </div>
          <p className="text-lg font-medium text-text-secondary">
            Aun no tienes deudas registradas
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
            Cada deuda tiene dos valores por mes: el <strong>Saldo</strong> que aun debes
            al cierre y el <strong>Pago</strong> que hiciste en ese mes. Con eso se
            calculan tu deuda total, tu presupuesto por dia y el consumo de tus tarjetas.
          </p>
          <Button
            onClick={openCreate}
            className="mt-6 h-11 rounded-xl bg-brand text-white hover:bg-brand-dark"
          >
            <Plus className="mr-1 h-4 w-4" />
            Crear mi primera deuda
          </Button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-0 overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 top-0 z-40 min-w-[150px] w-[210px] border-b border-r border-border-subtle bg-surface px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted"
                  >
                    Deuda
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      colSpan={2}
                      className={`sticky top-0 z-30 min-w-[150px] border-b border-l border-border-subtle px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider ${
                        col.key === currentKey
                          ? "bg-brand/10 text-brand"
                          : "bg-surface text-text-muted"
                      }`}
                    >
                      {monthLabel(col.year, col.month)}
                    </th>
                  ))}
                </tr>
                <tr>
                  {columns.map((col) => (
                    <Fragment key={col.key}>
                      <th
                        className={`sticky top-[33px] z-30 min-w-[75px] border-b border-l border-border-subtle px-2 py-1 text-right text-[10px] font-medium text-text-muted ${
                          col.key === currentKey ? "bg-brand/5" : "bg-surface"
                        }`}
                      >
                        Saldo
                      </th>
                      <th
                        className={`sticky top-[33px] z-30 min-w-[75px] border-b border-border-subtle px-2 py-1 text-right text-[10px] font-medium text-text-muted ${
                          col.key === currentKey ? "bg-brand/5" : "bg-surface"
                        }`}
                      >
                        Pagos
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {debts.map((debt) => (
                  <tr
                    key={debt.id}
                    className={`group transition-opacity ${
                      debt.isActive ? "" : "opacity-45"
                    }`}
                  >
                    <td className="sticky left-0 z-20 min-w-[150px] w-[210px] border-b border-r border-border-subtle bg-surface px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-text-primary">
                              {debt.name}
                            </span>
                            {debt.currency === "USD" && (
                              <span className="shrink-0 rounded bg-amber-accent/10 px-1 py-0.5 text-[9px] font-semibold text-amber-accent">
                                USD
                              </span>
                            )}
                          </div>
                          <Badge
                            variant="outline"
                            className="mt-0.5 border-border-subtle px-1 py-0 text-[9px] font-normal text-text-muted"
                          >
                            {DEBT_KIND_LABELS[debt.kind]}
                          </Badge>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
                              aria-label={`Acciones de ${debt.name}`}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="border-border-subtle bg-surface-overlay"
                          >
                            <DropdownMenuItem onSelect={() => openEdit(debt)}>
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleToggleDebt(debt)}>
                              {debt.isActive ? "Desactivar" : "Activar"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border-subtle" />
                            <DropdownMenuItem
                              className="text-red-accent focus:text-red-accent"
                              onSelect={() => handleDeleteDebt(debt)}
                            >
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>

                    {columns.map((col) => {
                      const cell = col.cells[debt.id] ?? EMPTY_CELL;
                      const isCurrent = col.key === currentKey;
                      return (
                        <Fragment key={col.key}>
                          {(["balance", "payment"] as EntryField[]).map((field) => {
                            const value = cell[field];
                            const cellId = `${debt.id}:${col.key}:${field}`;
                            const empty = !cell.exists && value === 0;
                            return (
                              <td
                                key={field}
                                className={`border-b border-border-subtle px-0.5 py-0.5 ${
                                  field === "balance" ? "border-l" : ""
                                } ${isCurrent ? "bg-brand/5" : ""}`}
                              >
                                <EditableAmount
                                  active={activeCell === cellId}
                                  display={
                                    empty ? "—" : formatMoney(value, debt.currency, unit)
                                  }
                                  initial={toEditString(value, debt.currency, unit)}
                                  dim={empty}
                                  textClassName={
                                    field === "payment"
                                      ? "text-brand/80"
                                      : "text-text-secondary"
                                  }
                                  title={cell.note ?? undefined}
                                  onActivate={() => setActiveCell(cellId)}
                                  onCancel={() =>
                                    setActiveCell((prev) =>
                                      prev === cellId ? null : prev
                                    )
                                  }
                                  onCommit={(raw) => saveEntry(debt, col, field, raw)}
                                />
                              </td>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot className="font-numbers">
                {/* DEUDA TOTAL */}
                <tr className="border-t-2 border-border-default">
                  <td className="sticky left-0 z-20 border-b border-r border-border-subtle bg-surface px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-primary">
                    Deuda total
                  </td>
                  {columns.map((col) => (
                    <Fragment key={col.key}>
                      <td
                        className={`border-b border-l border-border-subtle px-2 py-2 text-right text-xs font-bold text-text-primary ${
                          col.key === currentKey ? "bg-brand/5" : ""
                        }`}
                      >
                        {formatCop(col.summary.totalDebt, unit)}
                      </td>
                      <td
                        className={`border-b border-border-subtle px-2 py-2 text-right text-xs font-bold text-brand ${
                          col.key === currentKey ? "bg-brand/5" : ""
                        }`}
                      >
                        {formatCop(col.summary.totalPayments, unit)}
                      </td>
                    </Fragment>
                  ))}
                </tr>

                {/* Editable params */}
                {(
                  [
                    { field: "salary" as ParamField, label: "Sueldo" },
                    { field: "extraIncome" as ParamField, label: "Ingresos extra" },
                    { field: "trm" as ParamField, label: "TRM" },
                  ]
                ).map(({ field, label }) => (
                  <tr key={field}>
                    <td className="sticky left-0 z-20 border-b border-r border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-text-secondary">
                      {label}
                      {field === "trm" && (
                        <span className="ml-1 text-[9px] text-text-muted">COP/USD</span>
                      )}
                    </td>
                    {columns.map((col) => {
                      const cellId = `params:${col.key}:${field}`;
                      const inherited = field === "trm" && col.params.trm === null;
                      const rawValue =
                        field === "trm"
                          ? (col.params.trm ?? col.summary.trm)
                          : col.params[field];
                      const display =
                        field === "trm"
                          ? formatUsd(Math.round(rawValue))
                          : rawValue === 0
                            ? "—"
                            : formatCop(rawValue, unit);
                      return (
                        <td
                          key={col.key}
                          colSpan={2}
                          className={`border-b border-l border-border-subtle px-0.5 py-0.5 ${
                            col.key === currentKey ? "bg-brand/5" : ""
                          }`}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {inherited && (
                              <span className="text-[9px] uppercase text-text-muted">
                                auto
                              </span>
                            )}
                            <EditableAmount
                              active={activeCell === cellId}
                              display={display}
                              initial={
                                field === "trm"
                                  ? col.params.trm === null
                                    ? ""
                                    : String(col.params.trm)
                                  : toEditString(rawValue, "COP", unit)
                              }
                              dim={
                                inherited || (field !== "trm" && rawValue === 0)
                              }
                              title={
                                inherited
                                  ? "TRM heredada del mes anterior o del tipo de cambio actual"
                                  : undefined
                              }
                              onActivate={() => setActiveCell(cellId)}
                              onCancel={() =>
                                setActiveCell((prev) => (prev === cellId ? null : prev))
                              }
                              onCommit={(raw) => saveMonthParam(col, field, raw)}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Presupuesto / dia */}
                <tr>
                  <td className="sticky left-0 z-20 border-b border-r border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-text-secondary">
                    Presupuesto/dia
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      colSpan={2}
                      className={`border-b border-l border-border-subtle px-2 py-1.5 text-right text-xs text-text-secondary ${
                        col.key === currentKey ? "bg-brand/5" : ""
                      }`}
                      title={`${col.summary.daysInMonth} dias en el mes`}
                    >
                      {formatCop(col.summary.budgetPerDay, unit)}
                    </td>
                  ))}
                </tr>

                {/* Ejecutado / dia + % ejecucion */}
                <tr>
                  <td className="sticky left-0 z-20 border-b border-r border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-text-secondary">
                    Ejecutado/dia
                    <span className="ml-1 text-[9px] text-text-muted">· % ejec.</span>
                  </td>
                  {columns.map((col) => (
                    <Fragment key={col.key}>
                      <td
                        className={`border-b border-l border-border-subtle px-2 py-1.5 text-right text-xs text-text-secondary ${
                          col.key === currentKey ? "bg-brand/5" : ""
                        }`}
                        title={`${col.summary.daysElapsed}/${col.summary.daysInMonth} dias transcurridos`}
                      >
                        {formatCop(col.summary.spentPerDay, unit)}
                      </td>
                      <td
                        className={`border-b border-border-subtle px-2 py-1.5 text-right text-xs font-semibold ${
                          col.summary.executionRatio === null
                            ? "text-text-muted"
                            : col.summary.executionRatio <= 1
                              ? "text-brand"
                              : "text-red-accent"
                        } ${col.key === currentKey ? "bg-brand/5" : ""}`}
                      >
                        {formatPercent(col.summary.executionRatio)}
                      </td>
                    </Fragment>
                  ))}
                </tr>

                {/* Diferencia */}
                <tr>
                  <td className="sticky left-0 z-20 border-b border-r border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-text-secondary">
                    Diferencia
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      colSpan={2}
                      className={`border-b border-l border-border-subtle px-2 py-1.5 text-right text-xs font-semibold ${
                        col.summary.difference >= 0 ? "text-brand" : "text-red-accent"
                      } ${col.key === currentKey ? "bg-brand/5" : ""}`}
                    >
                      {formatCop(col.summary.difference, unit)}
                    </td>
                  ))}
                </tr>

                {/* Consumo TC */}
                <tr>
                  <td className="sticky left-0 z-20 border-r border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-text-secondary">
                    Consumo TC
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      colSpan={2}
                      className={`border-l border-border-subtle px-2 py-1.5 text-right text-xs font-semibold ${
                        col.summary.cardUsage === null
                          ? "text-text-muted"
                          : col.summary.cardUsage > 0.9
                            ? "text-red-accent"
                            : "text-text-secondary"
                      } ${col.key === currentKey ? "bg-brand/5" : ""}`}
                    >
                      {formatPercent(col.summary.cardUsage)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2">
            <p className="text-[11px] text-text-muted">
              Valores en {unitLabel} · haz clic en una celda para editarla
            </p>
            {saving && (
              <span className="flex items-center gap-1 text-[11px] text-text-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                Guardando
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cupos de tarjetas */}
      {!loading && cards.length > 0 && latest && latestColumn && (
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-text-primary">Cupos de tarjetas</h2>
          </div>
          <div className="space-y-4">
            {cards.map((card) => {
              const cell = latestColumn.cells[card.id] ?? EMPTY_CELL;
              const limit = card.creditLimit ?? 0;
              const usage = limit > 0 ? cell.balance / limit : null;
              return (
                <div key={card.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs font-medium text-text-primary">
                      {card.name}
                    </span>
                    <span className="shrink-0 font-numbers text-xs text-text-secondary">
                      {formatMoney(cell.balance, card.currency, unit)}
                      <span className="text-text-muted">
                        {" / "}
                        {formatMoney(limit, card.currency, unit)}
                      </span>
                      <span
                        className={`ml-2 font-semibold ${
                          usage !== null && usage > 0.9 ? "text-red-accent" : "text-brand"
                        }`}
                      >
                        {formatPercent(usage)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <UsageBar ratio={usage} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-border-subtle pt-4">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">
              Total · {monthLabel(latest.year, latest.month)}
            </span>
            <span className="font-numbers text-xs text-text-secondary">
              {formatCop(latest.cardBalance, unit)}
              <span className="text-text-muted">
                {" / "}
                {formatCop(latest.cardLimit, unit)}
              </span>
              <span
                className={`ml-2 font-semibold ${
                  latest.cardUsage !== null && latest.cardUsage > 0.9
                    ? "text-red-accent"
                    : "text-brand"
                }`}
              >
                {formatPercent(latest.cardUsage)}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Dialog nueva / editar deuda */}
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
              {editingDebt ? "Editar deuda" : "Nueva deuda"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitDebt} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-text-secondary">
                Nombre
              </Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Visa Bancolombia, Credito de vivienda"
                required
                className="h-11 rounded-xl border-border-subtle bg-surface-raised/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-text-secondary">
                  Tipo
                </Label>
                <Select
                  value={formKind}
                  onValueChange={(v) => setFormKind(v as DebtKind)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border-subtle bg-surface-raised/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border-subtle bg-surface-overlay">
                    {(Object.keys(DEBT_KIND_LABELS) as DebtKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {DEBT_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-text-secondary">
                  Moneda
                </Label>
                <Select
                  value={formCurrency}
                  onValueChange={(v) => setFormCurrency(v as Currency)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border-subtle bg-surface-raised/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border-subtle bg-surface-overlay">
                    <SelectItem value="COP">COP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-text-secondary">
                Cupo ({formCurrency === "USD" ? "USD" : unitLabel}) · opcional
              </Label>
              <Input
                value={formLimit}
                onChange={(e) => setFormLimit(e.target.value)}
                inputMode="decimal"
                placeholder={
                  formCurrency === "USD"
                    ? "5000"
                    : unit === "miles"
                      ? "12000"
                      : "12000000"
                }
                className="h-11 rounded-xl border-border-subtle bg-surface-raised/50 font-numbers"
              />
              <p className="text-[11px] text-text-muted">
                Solo aplica a tarjetas de credito; se usa para calcular el % de consumo.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-text-secondary">
                Notas (opcional)
              </Label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Ej: corte el 15 de cada mes"
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
              ) : editingDebt ? (
                "Guardar cambios"
              ) : (
                "Crear deuda"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
