"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LoanTrackingMode, ScheduleRow } from "@/lib/loans";

/* -------------------------------------------------------------------------- */
/*  Shared constants                                                           */
/* -------------------------------------------------------------------------- */

export const MONTH_ABBR = [
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

export const MODE_LABELS: Record<LoanTrackingMode, string> = {
  SCHEDULE: "Por tabla + abonos extra",
  PAYMENTS: "Por pagos realizados",
};

export const MODE_HINTS: Record<LoanTrackingMode, string> = {
  SCHEDULE:
    "La cuota se da por pagada cuando llega el mes; tu registras los abonos extra a capital y, si quieres, el saldo que reporta el banco.",
  PAYMENTS:
    "Tu registras el pago real de cada mes; el saldo es el capital menos la suma de los pagos registrados.",
};

/* -------------------------------------------------------------------------- */
/*  Formatting / parsing helpers (same rules as /deudas)                       */
/* -------------------------------------------------------------------------- */

/** "Mar 2027" */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

/** "Mar 27" */
export function shortMonthLabel(year: number, month: number): string {
  return `${MONTH_ABBR[month - 1]} ${String(year % 100).padStart(2, "0")}`;
}

/** "2027-03" -> "Mar 2027" */
export function monthLabelFromKey(key: string | null): string {
  if (!key) return "—";
  const [rawYear, rawMonth] = key.split("-");
  const year = Number(rawYear);
  const month = Number(rawMonth);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return key;
  }
  return monthLabel(year, month);
}

/** Full COP pesos rendered in thousands: 14696000 -> "14.696". */
export function formatMiles(value: number): string {
  const rounded = Math.round((value / 1000) * 10) / 10;
  const decimals = Number.isInteger(rounded) ? 0 : 1;
  return rounded.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("es-CO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} %`;
}

/**
 * Accepts `1.234.567`, `4862`, `4,5`, `$ 4.862`.
 * A single dot followed by exactly three digits is read as a COP thousands
 * separator (same rule the rest of the app uses for COP amounts).
 */
export function parseAmountInput(raw: string): number | null {
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

/** Typed value (miles) -> stored full COP pesos. */
export function toStoredMiles(value: number): number {
  return Math.round(value * 1000);
}

/** Stored full COP pesos -> the string shown while editing (in miles). */
export function toEditString(value: number | null): string {
  if (value === null || value === 0) return "";
  return String(Number((value / 1000).toFixed(3)));
}

/* -------------------------------------------------------------------------- */
/*  Inline editable cell                                                       */
/* -------------------------------------------------------------------------- */

interface InlineEditProps {
  active: boolean;
  display: string;
  initial: string;
  align?: "left" | "right";
  numeric?: boolean;
  dim?: boolean;
  title?: string;
  textClassName?: string;
  onActivate: () => void;
  onCancel: () => void;
  onCommit: (raw: string) => void;
}

function InlineEdit({
  active,
  display,
  initial,
  align = "right",
  numeric = true,
  dim = false,
  title,
  textClassName,
  onActivate,
  onCancel,
  onCommit,
}: InlineEditProps) {
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
  } px-2 rounded-md font-numbers text-xs tabular-nums leading-8 transition-colors truncate`;

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
        inputMode={numeric ? "decimal" : "text"}
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
/*  Schedule table                                                             */
/* -------------------------------------------------------------------------- */

export interface PeriodPatch {
  payment?: number | null;
  extraPayment?: number | null;
  balanceOverride?: number | null;
  note?: string | null;
}

type AmountField = "payment" | "extraPayment" | "balanceOverride";

interface LoanScheduleProps {
  loanId: string;
  rows: ScheduleRow[];
  trackingMode: LoanTrackingMode;
  saving: boolean;
  onSave: (period: number, patch: PeriodPatch) => Promise<void>;
}

function buildPatch(field: AmountField, value: number | null): PeriodPatch {
  if (field === "payment") return { payment: value };
  if (field === "extraPayment") return { extraPayment: value };
  return { balanceOverride: value };
}

const HEAD_CELL =
  "sticky top-0 z-20 border-b border-border-subtle bg-surface px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted";

export function LoanSchedule({
  loanId,
  rows,
  trackingMode,
  saving,
  onSave,
}: LoanScheduleProps) {
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLTableRowElement>(null);

  const isSchedule = trackingMode === "SCHEDULE";

  const scrollToCurrent = useCallback(() => {
    const container = scrollRef.current;
    const row = currentRowRef.current;
    if (!container || !row) return;
    container.scrollTop = Math.max(
      0,
      row.offsetTop - container.clientHeight / 2 + row.offsetHeight / 2
    );
  }, []);

  // Land on the current month whenever another loan is selected.
  useEffect(() => {
    scrollToCurrent();
  }, [loanId, rows.length, scrollToCurrent]);

  const payoffPeriod = useMemo(() => {
    const row = rows.find((r) => r.isPaidOff);
    return row ? row.period : null;
  }, [rows]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          cuota: acc.cuota + r.cuota,
          interest: acc.interest + r.interest,
          amortization: acc.amortization + r.amortization,
          realPaid: acc.realPaid + r.realPaid,
        }),
        { cuota: 0, interest: 0, amortization: 0, realPaid: 0 }
      ),
    [rows]
  );

  const commitAmount = (period: number, field: AmountField, raw: string) => {
    const parsed = parseAmountInput(raw);
    if (parsed !== null && parsed < 0) {
      toast.error("El valor no puede ser negativo");
      return;
    }
    void onSave(period, buildPatch(field, parsed === null ? null : toStoredMiles(parsed)));
  };

  const commitNote = (period: number, raw: string) => {
    const trimmed = raw.trim();
    void onSave(period, { note: trimmed === "" ? null : trimmed });
  };

  const renderAmountCell = (
    row: ScheduleRow,
    field: AmountField,
    textClassName: string
  ) => {
    const cellId = `${row.period}:${field}`;
    const value = row[field];
    return (
      <InlineEdit
        active={activeCell === cellId}
        display={value === null ? "—" : formatMiles(value)}
        initial={toEditString(value)}
        dim={value === null}
        textClassName={textClassName}
        onActivate={() => setActiveCell(cellId)}
        onCancel={() => setActiveCell((prev) => (prev === cellId ? null : prev))}
        onCommit={(raw) => commitAmount(row.period, field, raw)}
      />
    );
  };

  return (
    <div className="glass-card overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Tabla de amortizacion
          </h2>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {MODE_HINTS[trackingMode]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando
            </span>
          )}
          <button
            type="button"
            onClick={scrollToCurrent}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-raised/50 px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Ir al mes actual
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="relative max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-xs">
          <thead>
            <tr>
              <th className={`${HEAD_CELL} w-10 text-right`}>#</th>
              <th className={`${HEAD_CELL} text-left`}>Mes</th>
              <th className={`${HEAD_CELL} text-right`}>Cuota</th>
              <th className={`${HEAD_CELL} text-right`}>Interes</th>
              <th className={`${HEAD_CELL} text-right`}>Amortizacion</th>
              <th className={`${HEAD_CELL} text-right`}>Saldo teorico</th>
              {isSchedule ? (
                <>
                  <th className={`${HEAD_CELL} text-right`}>Abono extra</th>
                  <th className={`${HEAD_CELL} text-right`}>Saldo real (reportado)</th>
                </>
              ) : (
                <th className={`${HEAD_CELL} text-right`}>Pago real</th>
              )}
              <th className={`${HEAD_CELL} text-right`}>Saldo real</th>
              <th className={`${HEAD_CELL} text-left`}>Nota</th>
            </tr>
          </thead>

          <tbody className="font-numbers">
            {rows.map((row) => {
              const afterPayoff = payoffPeriod !== null && row.period > payoffPeriod;
              const noteId = `${row.period}:note`;
              return (
                <tr
                  key={row.period}
                  ref={row.isCurrent ? currentRowRef : undefined}
                  className={`border-b border-border-subtle transition-colors ${
                    row.isCurrent
                      ? "bg-brand/5"
                      : afterPayoff
                        ? "opacity-40"
                        : row.isPast
                          ? "opacity-70"
                          : ""
                  }`}
                >
                  <td className="px-3 py-1 text-right text-[11px] text-text-muted">
                    {row.period}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-1 text-left text-xs ${
                      row.isCurrent
                        ? "font-semibold text-brand"
                        : "text-text-secondary"
                    }`}
                  >
                    {shortMonthLabel(row.year, row.month)}
                  </td>
                  <td className="px-3 py-1 text-right text-text-secondary">
                    {formatMiles(row.cuota)}
                  </td>
                  <td className="px-3 py-1 text-right text-amber-accent/80">
                    {formatMiles(row.interest)}
                  </td>
                  <td className="px-3 py-1 text-right text-text-secondary">
                    {formatMiles(row.amortization)}
                  </td>
                  <td className="px-3 py-1 text-right text-text-muted">
                    {formatMiles(row.theoreticalBalance)}
                  </td>

                  {isSchedule ? (
                    <>
                      <td className="px-1 py-0.5">
                        {renderAmountCell(row, "extraPayment", "text-brand/80")}
                      </td>
                      <td className="px-1 py-0.5">
                        {renderAmountCell(row, "balanceOverride", "text-text-secondary")}
                      </td>
                    </>
                  ) : (
                    <td className="px-1 py-0.5">
                      {renderAmountCell(row, "payment", "text-brand/80")}
                    </td>
                  )}

                  <td className="px-3 py-1 text-right font-bold text-text-primary">
                    {row.isPaidOff ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                        Pagado
                      </span>
                    ) : (
                      formatMiles(row.realBalance)
                    )}
                  </td>
                  <td className="w-[150px] px-1 py-0.5">
                    <InlineEdit
                      active={activeCell === noteId}
                      display={row.note ?? "—"}
                      initial={row.note ?? ""}
                      align="left"
                      numeric={false}
                      dim={row.note === null}
                      title={row.note ?? undefined}
                      onActivate={() => setActiveCell(noteId)}
                      onCancel={() =>
                        setActiveCell((prev) => (prev === noteId ? null : prev))
                      }
                      onCommit={(raw) => commitNote(row.period, raw)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot className="font-numbers">
            <tr className="border-t-2 border-border-default">
              <td
                colSpan={2}
                className="sticky bottom-0 bg-surface px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-text-primary"
              >
                Totales
              </td>
              <td className="sticky bottom-0 bg-surface px-3 py-2 text-right text-xs font-bold text-text-primary">
                {formatMiles(totals.cuota)}
              </td>
              <td className="sticky bottom-0 bg-surface px-3 py-2 text-right text-xs font-bold text-amber-accent">
                {formatMiles(totals.interest)}
              </td>
              <td className="sticky bottom-0 bg-surface px-3 py-2 text-right text-xs font-bold text-text-primary">
                {formatMiles(totals.amortization)}
              </td>
              <td className="sticky bottom-0 bg-surface px-3 py-2" />
              <td
                colSpan={isSchedule ? 2 : 1}
                className="sticky bottom-0 bg-surface px-3 py-2 text-right text-xs font-bold text-brand"
              >
                <span className="mr-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Pagado real
                </span>
                {formatMiles(totals.realPaid)}
              </td>
              <td className="sticky bottom-0 bg-surface px-3 py-2" />
              <td className="sticky bottom-0 bg-surface px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="border-t border-border-subtle px-4 py-2">
        <p className="text-[11px] text-text-muted">
          Valores en miles de pesos · haz clic en una celda editable para cambiarla ·
          Enter guarda, Esc cancela, vacio borra el dato
        </p>
      </div>
    </div>
  );
}
