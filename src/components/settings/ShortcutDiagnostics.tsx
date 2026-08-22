"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { RefreshCw, Activity } from "lucide-react";

interface ShortcutEvent {
  id: string;
  receivedAt: string;
  rawBody: unknown;
  parsedMerchant: string | null;
  parsedAmount: number | null;
  parsedCurrency: string | null;
  amountSource: string | null;
  status: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  created: { label: "OK con monto", className: "text-brand bg-brand/10 border-brand/20" },
  created_pending_amount: { label: "Sin monto", className: "text-amber-accent bg-amber-accent/10 border-amber-accent/20" },
  invalid_json: { label: "JSON invalido", className: "text-red-accent bg-red-accent/10 border-red-accent/20" },
};

/**
 * Shows the last payloads received from the iOS "Transaction" automation so the
 * user can see exactly what the shortcut sends (and why an amount came as 0).
 */
export default function ShortcutDiagnostics() {
  const [events, setEvents] = useState<ShortcutEvent[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ events: ShortcutEvent[]; pendingCount: number }>(
        "/api/expenses/shortcut/events?limit=10"
      );
      setEvents(res.events);
      setPendingCount(res.pendingCount);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-4 rounded-xl border border-border-subtle bg-surface-raised/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-text-muted" />
          <h4 className="text-sm font-semibold text-text-primary">Diagnostico del atajo</h4>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        Ultimos envios recibidos desde tu iPhone, tal cual llegan. Si el monto llega en 0, el campo
        <code className="mx-1 rounded bg-surface-overlay px-1 text-[11px]">amount</code>
        del atajo esta enviando 0: configuralo como <strong>Texto</strong> con la variable
        <em> Importe/Amount </em> de la transaccion (no como Numero).
        {pendingCount > 0 && (
          <span className="ml-1 text-amber-accent">Tienes {pendingCount} gasto(s) con monto pendiente en Gastos.</span>
        )}
      </p>

      {!loading && events.length === 0 && (
        <p className="mt-3 text-xs text-text-muted">Aun no se ha recibido ningun envio desde la actualizacion.</p>
      )}

      <ul className="mt-3 space-y-1.5">
        {events.map((ev) => {
          const st = STATUS_LABELS[ev.status] ?? { label: ev.status, className: "text-text-muted bg-surface-overlay border-border-subtle" };
          const amountText =
            ev.parsedAmount !== null && ev.parsedAmount > 0
              ? `${ev.parsedAmount.toLocaleString("es-CO", { maximumFractionDigits: 2 })} ${ev.parsedCurrency ?? ""}`
              : "—";
          return (
            <li key={ev.id} className="rounded-lg border border-border-subtle bg-surface/60 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpen(open === ev.id ? null : ev.id)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">{ev.parsedMerchant ?? "(sin comercio)"}</p>
                  <p className="text-[11px] text-text-muted">
                    {new Date(ev.receivedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                    {ev.amountSource ? ` · monto desde "${ev.amountSource}"` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-numbers text-sm text-text-secondary">{amountText}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${st.className}`}>{st.label}</span>
                </div>
              </button>
              {open === ev.id && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-surface-overlay p-2 text-[11px] leading-relaxed text-text-secondary">
                  {JSON.stringify(ev.rawBody, null, 2)}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
