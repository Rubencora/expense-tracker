"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { addMonths } from "@/lib/debts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Plus, StickyNote, Trash2 } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type Unit = "miles" | "usd";

interface MonthRef {
  year: number;
  month: number;
  /** COP per USD of that month, used when the page is showing USD. */
  trm: number;
}

interface NoteItem {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
}

interface NoteGroup {
  id: string;
  year: number;
  month: number;
  title: string;
  sortOrder: number;
  items: NoteItem[];
  total: number;
}

interface CopyResponse {
  copied: number;
  skipped: number;
  groups: NoteGroup[];
}

interface MonthNotesProps {
  months: MonthRef[];
  unit: Unit;
  initialYear?: number;
  initialMonth?: number;
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

const NEW_GROUP_TITLE = "Nuevo grupo";
const NEW_ITEM_LABEL = "Nueva linea";

function monthKeyOf(year: number, month: number): string {
  return `${year}-${month}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

/** Shows the stored COP amount in the unit selected on the page. */
function formatAmount(value: number, unit: Unit, trm: number): string {
  if (unit === "miles") {
    const miles = Math.round((value / 1000) * 10) / 10;
    return miles.toLocaleString("es-CO", {
      maximumFractionDigits: Number.isInteger(miles) ? 0 : 1,
    });
  }
  return (trm > 0 ? value / trm : 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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

/** Converts a typed value into the stored full-peso amount. */
function toStored(value: number, unit: Unit, trm: number): number {
  if (unit === "miles") return Math.round(value * 1000);
  return Math.round(value * trm);
}

/** Converts a stored amount into the string shown while editing. */
function toEditString(value: number, unit: Unit, trm: number): string {
  if (value === 0) return "";
  if (unit === "miles") return String(Number((value / 1000).toFixed(3)));
  return String(Number((trm > 0 ? value / trm : 0).toFixed(2)));
}

/* -------------------------------------------------------------------------- */
/*  Inline editable field                                                      */
/* -------------------------------------------------------------------------- */

interface InlineEditProps {
  active: boolean;
  display: string;
  initial: string;
  align?: "left" | "right";
  size?: "sm" | "md";
  inputMode?: "text" | "decimal";
  textClassName?: string;
  onActivate: () => void;
  onCancel: () => void;
  onCommit: (raw: string) => void;
}

function InlineEdit({
  active,
  display,
  initial,
  align = "left",
  size = "sm",
  inputMode = "text",
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

  const base = `${size === "md" ? "h-8 leading-8" : "h-7 leading-7"} w-full rounded-md px-2 ${
    align === "right" ? "text-right" : "text-left"
  } text-xs transition-colors`;

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
        inputMode={inputMode}
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
        className={`${base} ${
          inputMode === "decimal" ? "font-numbers tabular-nums" : ""
        } border border-brand/60 bg-surface-overlay text-text-primary outline-none`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onActivate}
      className={`${base} truncate border border-transparent hover:border-border-default hover:bg-surface-raised/60 focus:border-brand/60 focus:outline-none ${
        textClassName ?? "text-text-secondary"
      }`}
    >
      {display}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Month notes                                                                */
/* -------------------------------------------------------------------------- */

export function MonthNotes({ months, unit, initialYear, initialMonth }: MonthNotesProps) {
  const fallback = months.length > 0 ? months[months.length - 1] : null;
  const [selected, setSelected] = useState<string>(() => {
    if (initialYear !== undefined && initialMonth !== undefined) {
      return monthKeyOf(initialYear, initialMonth);
    }
    return fallback ? monthKeyOf(fallback.year, fallback.month) : "";
  });
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  const options = useMemo(() => [...months].reverse(), [months]);

  const current = useMemo<MonthRef | null>(
    () => months.find((m) => monthKeyOf(m.year, m.month) === selected) ?? null,
    [months, selected]
  );

  // Keeps the selection valid when the page changes its month range.
  useEffect(() => {
    if (months.length === 0) return;
    const exists = months.some((m) => monthKeyOf(m.year, m.month) === selected);
    if (exists) return;
    const last = months[months.length - 1];
    setSelected(monthKeyOf(last.year, last.month));
  }, [months, selected]);

  // Primitives keep the fetch stable even if the parent rebuilds the months array.
  const currentYear = current?.year ?? null;
  const currentMonth = current?.month ?? null;

  const fetchNotes = useCallback(
    async (withSpinner: boolean) => {
      if (currentYear === null || currentMonth === null) return;
      if (withSpinner) setLoading(true);
      try {
        const result = await apiClient<{ groups: NoteGroup[] }>(
          `/api/debts/notes?year=${currentYear}&month=${currentMonth}`
        );
        setGroups(result.groups);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cargar las notas");
      } finally {
        if (withSpinner) setLoading(false);
      }
    },
    [currentYear, currentMonth]
  );

  useEffect(() => {
    fetchNotes(true);
  }, [fetchNotes]);

  /* ---------------------------- Mutations -------------------------------- */

  const handleCopyPrevious = async () => {
    if (!current) return;
    const previous = addMonths(current.year, current.month, -1);
    setCopying(true);
    try {
      const result = await apiClient<CopyResponse>("/api/debts/notes/copy", {
        method: "POST",
        body: JSON.stringify({
          fromYear: previous.year,
          fromMonth: previous.month,
          toYear: current.year,
          toMonth: current.month,
        }),
      });
      setGroups(result.groups);
      toast.success(
        result.copied > 0 ? `${result.copied} grupos copiados` : "Nada que copiar"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al copiar los grupos");
    } finally {
      setCopying(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!current) return;
    setCreating(true);
    try {
      const group = await apiClient<NoteGroup>("/api/debts/notes", {
        method: "POST",
        body: JSON.stringify({
          year: current.year,
          month: current.month,
          title: NEW_GROUP_TITLE,
          items: [{ label: NEW_ITEM_LABEL, amount: 0 }],
        }),
      });
      setGroups((prev) => [...prev, group]);
      setActiveField(`title:${group.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el grupo");
    } finally {
      setCreating(false);
    }
  };

  const handleRenameGroup = async (group: NoteGroup, raw: string) => {
    const title = raw.trim();
    if (title === "" || title === group.title) return;
    const snapshot = groups;
    setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, title } : g)));
    try {
      await apiClient<NoteGroup>(`/api/debts/notes/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    } catch (err) {
      setGroups(snapshot);
      toast.error(err instanceof Error ? err.message : "Error al renombrar el grupo");
    }
  };

  const handleDeleteGroup = async (group: NoteGroup) => {
    const ok = window.confirm(
      `Eliminar el grupo "${group.title}" y todas sus lineas? Esta accion no se puede deshacer.`
    );
    if (!ok) return;
    const snapshot = groups;
    setGroups((prev) => prev.filter((g) => g.id !== group.id));
    try {
      await apiClient(`/api/debts/notes/${group.id}`, { method: "DELETE" });
    } catch (err) {
      setGroups(snapshot);
      toast.error(err instanceof Error ? err.message : "Error al eliminar el grupo");
    }
  };

  const handleAddItem = async (group: NoteGroup) => {
    try {
      const item = await apiClient<NoteItem>(`/api/debts/notes/${group.id}/items`, {
        method: "POST",
        body: JSON.stringify({ label: NEW_ITEM_LABEL, amount: 0 }),
      });
      setGroups((prev) =>
        prev.map((g) => (g.id === group.id ? { ...g, items: [...g.items, item] } : g))
      );
      setActiveField(`label:${item.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear la linea");
    }
  };

  const updateItem = async (
    group: NoteGroup,
    item: NoteItem,
    patch: Partial<Pick<NoteItem, "label" | "amount">>
  ) => {
    const snapshot = groups;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === group.id
          ? {
              ...g,
              items: g.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)),
            }
          : g
      )
    );
    try {
      await apiClient<NoteItem>(`/api/debts/notes/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch (err) {
      setGroups(snapshot);
      toast.error(err instanceof Error ? err.message : "Error al guardar la linea");
    }
  };

  const handleDeleteItem = async (group: NoteGroup, item: NoteItem) => {
    const snapshot = groups;
    setGroups((prev) =>
      prev.map((g) =>
        g.id === group.id ? { ...g, items: g.items.filter((i) => i.id !== item.id) } : g
      )
    );
    try {
      await apiClient(`/api/debts/notes/items/${item.id}`, { method: "DELETE" });
    } catch (err) {
      setGroups(snapshot);
      toast.error(err instanceof Error ? err.message : "Error al eliminar la linea");
    }
  };

  /* ---------------------------- Derived ---------------------------------- */

  const unitLabel = unit === "miles" ? "miles" : "USD";
  const trm = current?.trm ?? 0;

  const monthTotal = useMemo(
    () =>
      groups.reduce(
        (sum, group) => sum + group.items.reduce((acc, item) => acc + item.amount, 0),
        0
      ),
    [groups]
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-9 w-[120px] rounded-xl border-border-subtle bg-surface-raised/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-border-subtle bg-surface-overlay">
          {options.map((m) => (
            <SelectItem key={monthKeyOf(m.year, m.month)} value={monthKeyOf(m.year, m.month)}>
              {monthLabel(m.year, m.month)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        variant="outline"
        disabled={copying}
        onClick={handleCopyPrevious}
        className="h-9 rounded-xl border-border-subtle bg-surface-raised/50 text-text-secondary hover:text-text-primary"
      >
        <Copy className="mr-1 h-3.5 w-3.5" />
        Copiar del mes anterior
      </Button>

      <Button
        size="sm"
        disabled={creating}
        onClick={handleCreateGroup}
        className="h-9 rounded-xl bg-brand text-white hover:bg-brand-dark"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Nuevo grupo
      </Button>
    </div>
  );

  /* ---------------------------- Render ----------------------------------- */

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2">
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Notas del mes</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Bloques libres por mes, como debajo de cada columna en tu Excel
            </p>
          </div>
        </div>
        {actions}
      </div>

      {loading ? (
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border-subtle px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">Este mes no tiene notas</p>
          <p className="mt-1 text-xs text-text-muted">
            Copia los bloques del mes anterior o crea uno nuevo
          </p>
          <div className="mt-4 flex justify-center">{actions}</div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => {
              const total = group.items.reduce((acc, item) => acc + item.amount, 0);
              return (
                <div
                  key={group.id}
                  className="glass-card glass-card-hover flex flex-col rounded-2xl p-3"
                >
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <InlineEdit
                        active={activeField === `title:${group.id}`}
                        display={group.title}
                        initial={group.title}
                        size="md"
                        textClassName="text-text-primary font-semibold"
                        onActivate={() => setActiveField(`title:${group.id}`)}
                        onCancel={() =>
                          setActiveField((prev) =>
                            prev === `title:${group.id}` ? null : prev
                          )
                        }
                        onCommit={(raw) => handleRenameGroup(group, raw)}
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
                          aria-label={`Acciones de ${group.title}`}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-border-subtle bg-surface-overlay"
                      >
                        <DropdownMenuItem onSelect={() => handleAddItem(group)}>
                          Agregar linea
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border-subtle" />
                        <DropdownMenuItem
                          className="text-red-accent focus:text-red-accent"
                          onSelect={() => handleDeleteGroup(group)}
                        >
                          Eliminar grupo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-1 space-y-0.5">
                    {group.items.map((item) => (
                      <div key={item.id} className="group/item flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <InlineEdit
                            active={activeField === `label:${item.id}`}
                            display={item.label}
                            initial={item.label}
                            onActivate={() => setActiveField(`label:${item.id}`)}
                            onCancel={() =>
                              setActiveField((prev) =>
                                prev === `label:${item.id}` ? null : prev
                              )
                            }
                            onCommit={(raw) => {
                              const label = raw.trim();
                              if (label === "" || label === item.label) return;
                              updateItem(group, item, { label });
                            }}
                          />
                        </div>
                        <div className="w-24 shrink-0">
                          <InlineEdit
                            active={activeField === `amount:${item.id}`}
                            display={formatAmount(item.amount, unit, trm)}
                            initial={toEditString(item.amount, unit, trm)}
                            align="right"
                            inputMode="decimal"
                            textClassName={`font-numbers tabular-nums ${
                              item.amount < 0 ? "text-red-accent" : "text-text-secondary"
                            }`}
                            onActivate={() => setActiveField(`amount:${item.id}`)}
                            onCancel={() =>
                              setActiveField((prev) =>
                                prev === `amount:${item.id}` ? null : prev
                              )
                            }
                            onCommit={(raw) => {
                              const parsed = parseAmountInput(raw);
                              const amount = parsed === null ? 0 : toStored(parsed, unit, trm);
                              if (amount === item.amount) return;
                              updateItem(group, item, { amount });
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Eliminar ${item.label}`}
                          onClick={() => handleDeleteItem(group, item)}
                          className="shrink-0 rounded-md p-1 text-text-muted opacity-0 transition-opacity hover:text-red-accent focus:opacity-100 group-hover/item:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-primary">
                      Total
                      <span className="ml-1 text-[9px] font-normal normal-case text-text-muted">
                        en {unitLabel}
                      </span>
                    </span>
                    <span
                      className={`font-numbers text-xs font-bold tabular-nums ${
                        total < 0 ? "text-red-accent" : "text-text-primary"
                      }`}
                    >
                      {formatAmount(total, unit, trm)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddItem(group)}
                    className="mt-2 w-full rounded-lg py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-raised/60 hover:text-brand"
                  >
                    + Agregar linea
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-baseline justify-between border-t border-border-subtle pt-3">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">
              Total notas del mes
            </span>
            <span
              className={`font-numbers text-sm font-bold tabular-nums ${
                monthTotal < 0 ? "text-red-accent" : "text-text-primary"
              }`}
            >
              {formatAmount(monthTotal, unit, trm)}
              <span className="ml-1 text-[10px] font-normal text-text-muted">
                en {unitLabel}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default MonthNotes;
