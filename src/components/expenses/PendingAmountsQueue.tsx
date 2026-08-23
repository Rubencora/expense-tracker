"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { emitDataChanged } from "@/lib/data-events";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, SkipForward, Trash2 } from "lucide-react";

interface PendingExpense {
  id: string;
  merchant: string;
  currency: string;
  createdAt: string;
  category: { id: string; name: string; emoji: string };
}

/**
 * Parses a typed amount the same way as the rest of the Deudas/Gastos inputs:
 * "," is always the decimal separator; "." is thousands unless it looks like a
 * plain decimal (single dot, 1-2 trailing digits).
 */
function parseAmount(raw: string): number | null {
  let num = raw.replace(/[^0-9.,]/g, "");
  if (!num) return null;
  const lastDot = num.lastIndexOf(".");
  const lastComma = num.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    num = lastComma > lastDot ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  } else if (lastComma !== -1) {
    num = num.length - lastComma - 1 === 3 ? num.replace(/,/g, "") : num.replace(",", ".");
  } else if (lastDot !== -1 && (num.length - lastDot - 1 === 3 || (num.match(/\./g) ?? []).length > 1)) {
    num = num.replace(/\./g, "");
  }
  const n = Number(num);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Full-screen queue to fill in every "monto pendiente" expense (from the Apple Pay
 * shortcut) one after another without leaving the dialog — type the amount, hit
 * Enter, it saves and moves to the next one automatically.
 */
export default function PendingAmountsQueue({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [queue, setQueue] = useState<PendingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(0);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ expenses: PendingExpense[] }>("/api/expenses/pending?order=recent");
      setQueue(res.expenses);
      setDone(0);
    } catch {
      toast.error("No se pudieron cargar los pendientes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void load();
      setValue("");
    }
  }, [open, load]);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (current) setTimeout(() => inputRef.current?.focus(), 50);
  }, [current]);

  const advance = () => {
    setQueue((prev) => prev.slice(1));
    setDone((d) => d + 1);
    setValue("");
  };

  const save = async () => {
    if (!current) return;
    const amount = parseAmount(value);
    if (amount === null) {
      toast.error("Escribe un monto valido");
      return;
    }
    setSaving(true);
    try {
      await apiClient(`/api/expenses/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ amount, currency: current.currency }),
      });
      emitDataChanged("expenses");
      advance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const skip = () => advance();

  const remove = async () => {
    if (!current) return;
    if (!window.confirm(`¿Eliminar "${current.merchant || "(sin comercio)"}"? Esto no se puede deshacer.`)) return;
    setSaving(true);
    try {
      await apiClient(`/api/expenses/${current.id}`, { method: "DELETE" });
      emitDataChanged("expenses");
      advance();
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const total = done + queue.length;
  const dateLabel = useMemo(
    () =>
      current
        ? new Date(current.createdAt).toLocaleDateString("es-CO", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    [current]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border-subtle max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Completar pendientes</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-text-muted">Cargando...</div>
        ) : !current ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-brand" />
            <p className="text-sm text-text-secondary">
              {total > 0 ? "Completaste todos los pendientes." : "No tienes gastos pendientes de monto."}
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="space-y-4"
          >
            <p className="text-xs text-text-muted">
              {done + 1} de {total}
            </p>
            <div className="rounded-xl border border-border-subtle bg-surface-raised/50 p-4">
              <p className="text-lg font-semibold text-text-primary">
                {current.merchant || "(sin comercio)"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {dateLabel} · {current.category.emoji} {current.category.name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={current.currency === "COP" ? "45.000" : "12.34"}
                className="h-11 flex-1 rounded-xl border border-border-subtle bg-surface-raised px-3 text-right font-numbers text-lg text-text-primary outline-none focus:border-brand"
                autoFocus
              />
              <span className="text-sm text-text-muted">{current.currency}</span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={remove}
                disabled={saving}
                className="border-border-subtle text-red-accent hover:bg-red-accent/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={skip}
                disabled={saving}
                className="flex-1 border-border-subtle text-text-secondary"
              >
                <SkipForward className="mr-1.5 h-4 w-4" />
                Omitir
              </Button>
              <Button type="submit" disabled={saving} className="flex-1 bg-brand text-white hover:bg-brand-dark">
                Guardar y siguiente
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
