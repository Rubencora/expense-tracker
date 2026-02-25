"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { emitDataChanged } from "@/lib/data-events";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Pencil, Banknote } from "lucide-react";

interface SpaceInfo {
  id: string;
  name: string;
}

interface Income {
  id: string;
  name: string;
  amount: number;
  currency: string;
  amountUsd: number;
  frequency: string;
  isActive: boolean;
  nextDate: string | null;
  spaceId: string | null;
  notes: string | null;
  createdAt: string;
  space: { id: string; name: string } | null;
}

const FREQUENCY_LABELS: Record<string, string> = {
  ONCE: "Una vez",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  YEARLY: "Anual",
};

const FREQUENCY_STYLES: Record<string, string> = {
  ONCE: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
  WEEKLY: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  BIWEEKLY: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  MONTHLY: "bg-brand/10 text-brand border-brand/20",
  YEARLY: "bg-amber-accent/10 text-amber-accent border-amber-accent/20",
};

export default function IngresosPage() {
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formName, setFormName] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("COP");
  const [formFrequency, setFormFrequency] = useState("MONTHLY");
  const [formSpaceId, setFormSpaceId] = useState("personal");
  const [formNotes, setFormNotes] = useState("");

  const fetchIncomes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient<{ incomes: Income[] }>("/api/incomes");
      setIncomes(result.incomes);
    } catch (err) {
      console.error("Error fetching incomes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncomes();
    apiClient<{ spaces: SpaceInfo[] }>("/api/spaces").then((res) =>
      setSpaces(res.spaces)
    );
  }, [fetchIncomes]);

  const resetForm = () => {
    setFormName("");
    setFormAmount("");
    setFormCurrency("COP");
    setFormFrequency("MONTHLY");
    setFormSpaceId("personal");
    setFormNotes("");
    setEditingIncome(null);
  };

  const openEdit = (income: Income) => {
    setEditingIncome(income);
    setFormName(income.name);
    setFormAmount(String(income.amount));
    setFormCurrency(income.currency);
    setFormFrequency(income.frequency);
    setFormSpaceId(income.spaceId || "personal");
    setFormNotes(income.notes || "");
    setShowAddDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data: Record<string, unknown> = {
        name: formName,
        amount: parseFloat(formAmount),
        currency: formCurrency,
        frequency: formFrequency,
        notes: formNotes || null,
        spaceId: formSpaceId !== "personal" ? formSpaceId : null,
      };

      if (editingIncome) {
        const updated = await apiClient<Income>(`/api/incomes/${editingIncome.id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        setIncomes((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        emitDataChanged("incomes");
        toast.success("Ingreso actualizado");
      } else {
        await apiClient<Income>("/api/incomes", {
          method: "POST",
          body: JSON.stringify(data),
        });
        emitDataChanged("incomes");
        toast.success("Ingreso creado");
        fetchIncomes();
      }
      setShowAddDialog(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/incomes/${id}`, { method: "DELETE" });
      setIncomes((prev) => prev.filter((i) => i.id !== id));
      emitDataChanged("incomes");
      toast.success("Ingreso eliminado");
    } catch {
      toast.error("Error al eliminar el ingreso");
    }
  };

  const handleToggleActive = async (income: Income) => {
    try {
      const updated = await apiClient<Income>(`/api/incomes/${income.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !income.isActive }),
      });
      setIncomes((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      emitDataChanged("incomes");
      toast.success(updated.isActive ? "Ingreso activado" : "Ingreso pausado");
    } catch {
      toast.error("Error al actualizar");
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    if (currency === "COP") {
      return `$${amount.toLocaleString("es-CO")} COP`;
    }
    return `$${amount.toFixed(2)} USD`;
  };

  const totalMonthlyUsd = incomes
    .filter((i) => i.isActive)
    .reduce((sum, i) => {
      switch (i.frequency) {
        case "MONTHLY": return sum + i.amountUsd;
        case "WEEKLY": return sum + (i.amountUsd * 52) / 12;
        case "BIWEEKLY": return sum + (i.amountUsd * 26) / 12;
        case "YEARLY": return sum + i.amountUsd / 12;
        default: return sum;
      }
    }, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Ingresos</h1>
          <p className="text-sm text-text-muted mt-1">
            {incomes.filter((i) => i.isActive).length} activos · ~${totalMonthlyUsd.toFixed(2)} USD/mes
          </p>
        </div>
        <Dialog
          open={showAddDialog}
          onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="bg-brand hover:bg-brand-dark text-white">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border-subtle">
            <DialogHeader>
              <DialogTitle className="text-text-primary">
                {editingIncome ? "Editar ingreso" : "Nuevo ingreso"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Nombre</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Salario, Freelance, Arriendo"
                  required
                  className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Monto</Label>
                  <Input
                    type="number"
                    step="any"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="5000000"
                    required
                    className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl font-numbers"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Moneda</Label>
                  <Select value={formCurrency} onValueChange={setFormCurrency}>
                    <SelectTrigger className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-overlay border-border-subtle">
                      <SelectItem value="COP">COP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Frecuencia</Label>
                  <Select value={formFrequency} onValueChange={setFormFrequency}>
                    <SelectTrigger className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-overlay border-border-subtle">
                      <SelectItem value="ONCE">Una vez</SelectItem>
                      <SelectItem value="WEEKLY">Semanal</SelectItem>
                      <SelectItem value="BIWEEKLY">Quincenal</SelectItem>
                      <SelectItem value="MONTHLY">Mensual</SelectItem>
                      <SelectItem value="YEARLY">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Espacio</Label>
                  <Select value={formSpaceId} onValueChange={setFormSpaceId}>
                    <SelectTrigger className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-overlay border-border-subtle">
                      <SelectItem value="personal">Personal</SelectItem>
                      {spaces.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Notas (opcional)</Label>
                <Input
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ej: Contrato hasta diciembre"
                  className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingIncome ? "Guardar cambios" : "Crear ingreso"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Income List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : incomes.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
            <Banknote className="h-8 w-8 text-brand" />
          </div>
          <p className="text-text-secondary text-lg font-medium">No hay ingresos</p>
          <p className="text-text-muted text-sm mt-2">
            Registra tus fuentes de ingreso para ver tu flujo de caja
          </p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {incomes.map((income) => (
            <div
              key={income.id}
              className={`glass-card glass-card-hover rounded-xl p-4 transition-opacity ${
                !income.isActive ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary truncate">
                      {income.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 border ${
                        FREQUENCY_STYLES[income.frequency] || "border-border-subtle text-text-muted"
                      }`}
                    >
                      {FREQUENCY_LABELS[income.frequency] || income.frequency}
                    </Badge>
                    {!income.isActive && (
                      <Badge variant="outline" className="text-[10px] border-zinc-500/20 text-zinc-500">
                        Pausado
                      </Badge>
                    )}
                  </div>
                  {income.space && (
                    <p className="text-xs text-text-muted mt-1">
                      Espacio: {income.space.name}
                    </p>
                  )}
                  {income.notes && (
                    <p className="text-xs text-text-muted italic mt-1">{income.notes}</p>
                  )}
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="font-bold text-lg font-numbers text-text-primary">
                    {formatAmount(income.amount, income.currency)}
                  </p>
                  {income.currency !== "USD" && (
                    <p className="text-xs font-numbers text-text-muted">
                      ${income.amountUsd.toFixed(2)} USD
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-2">
                    <Switch
                      checked={income.isActive}
                      onCheckedChange={() => handleToggleActive(income)}
                      className="scale-75"
                    />
                    <button
                      onClick={() => openEdit(income)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-blue-400 hover:bg-blue-400/10 transition-all"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(income.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-red-accent hover:bg-red-accent/10 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
