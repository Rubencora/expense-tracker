"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { emitDataChanged } from "@/lib/data-events";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Pencil, Target, Check, PiggyBank } from "lucide-react";

interface SavingsGoal {
  id: string;
  name: string;
  icon: string;
  targetAmountUsd: number;
  currentAmountUsd: number;
  isCompleted: boolean;
  deadline: string | null;
  createdAt: string;
  contributionCount: number;
  totalContributed: number;
}

interface Contribution {
  id: string;
  amountUsd: number;
  note: string | null;
  createdAt: string;
}

const EMOJI_OPTIONS = ["🎯", "🏠", "✈️", "🚗", "💻", "📱", "🎓", "💍", "🏖️", "🎮", "💪", "🎵"];

export default function MetasPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Contribute dialog
  const [contributeGoal, setContributeGoal] = useState<SavingsGoal | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeCurrency, setContributeCurrency] = useState("USD");
  const [contributeNote, setContributeNote] = useState("");
  const [contributeLoading, setContributeLoading] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState("🎯");
  const [formTargetAmount, setFormTargetAmount] = useState("");
  const [formCurrency, setFormCurrency] = useState("USD");
  const [formDeadline, setFormDeadline] = useState("");

  const fetchGoals = useCallback(async () => {
    try {
      const result = await apiClient<SavingsGoal[]>("/api/savings-goals");
      setGoals(result);
    } catch (err) {
      console.error("Error fetching goals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const resetForm = () => {
    setFormName("");
    setFormIcon("🎯");
    setFormTargetAmount("");
    setFormCurrency("USD");
    setFormDeadline("");
    setEditingGoal(null);
  };

  const openEdit = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setFormName(goal.name);
    setFormIcon(goal.icon);
    setFormTargetAmount(String(goal.targetAmountUsd));
    setFormCurrency("USD");
    setFormDeadline(goal.deadline ? goal.deadline.split("T")[0] : "");
    setShowAddDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        name: formName,
        icon: formIcon,
        targetAmount: parseFloat(formTargetAmount),
        currency: formCurrency,
        deadline: formDeadline || null,
      };

      if (editingGoal) {
        await apiClient(`/api/savings-goals/${editingGoal.id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        toast.success("Meta actualizada");
      } else {
        await apiClient("/api/savings-goals", {
          method: "POST",
          body: JSON.stringify(data),
        });
        toast.success("Meta creada");
      }
      setShowAddDialog(false);
      resetForm();
      emitDataChanged("goals");
      fetchGoals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta meta de ahorro?")) return;
    try {
      await apiClient(`/api/savings-goals/${id}`, { method: "DELETE" });
      setGoals((prev) => prev.filter((g) => g.id !== id));
      emitDataChanged("goals");
      toast.success("Meta eliminada");
    } catch {
      toast.error("Error al eliminar la meta");
    }
  };

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributeGoal) return;
    setContributeLoading(true);
    try {
      await apiClient(`/api/savings-goals/${contributeGoal.id}/contribute`, {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(contributeAmount),
          currency: contributeCurrency,
          note: contributeNote || null,
        }),
      });
      toast.success("Aporte registrado");
      setContributeGoal(null);
      setContributeAmount("");
      setContributeCurrency("USD");
      setContributeNote("");
      emitDataChanged("goals");
      fetchGoals();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al aportar");
    } finally {
      setContributeLoading(false);
    }
  };

  const progressPercent = (goal: SavingsGoal) => {
    if (goal.targetAmountUsd <= 0) return 0;
    return Math.min((goal.currentAmountUsd / goal.targetAmountUsd) * 100, 100);
  };

  const daysUntilDeadline = (deadline: string | null) => {
    if (!deadline) return null;
    const diff = new Date(deadline).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const activeGoals = goals.filter((g) => !g.isCompleted);
  const completedGoals = goals.filter((g) => g.isCompleted);
  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmountUsd, 0);
  const totalTarget = activeGoals.reduce((sum, g) => sum + g.targetAmountUsd, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Metas de ahorro</h1>
          <p className="text-sm text-text-muted mt-1">
            {activeGoals.length} activas · ${totalSaved.toFixed(2)} ahorrados de ${totalTarget.toFixed(2)} USD
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
              Nueva meta
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border-subtle">
            <DialogHeader>
              <DialogTitle className="text-text-primary">
                {editingGoal ? "Editar meta" : "Nueva meta de ahorro"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Nombre</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Vacaciones, Carro nuevo, Fondo de emergencia"
                  required
                  className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Icono</Label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormIcon(emoji)}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                        formIcon === emoji
                          ? "bg-brand/20 ring-2 ring-brand"
                          : "bg-surface-raised/50 hover:bg-surface-overlay"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Meta</Label>
                  <Input
                    type="number"
                    step="any"
                    value={formTargetAmount}
                    onChange={(e) => setFormTargetAmount(e.target.value)}
                    placeholder="1000"
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
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Fecha limite (opcional)</Label>
                <Input
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingGoal ? "Guardar cambios" : "Crear meta"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Goals List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
            <Target className="h-8 w-8 text-brand" />
          </div>
          <p className="text-text-secondary text-lg font-medium">No hay metas de ahorro</p>
          <p className="text-text-muted text-sm mt-2">
            Crea tu primera meta para empezar a ahorrar con proposito
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Goals */}
          {activeGoals.length > 0 && (
            <div className="space-y-3 stagger-children">
              {activeGoals.map((goal) => {
                const progress = progressPercent(goal);
                const daysLeft = daysUntilDeadline(goal.deadline);
                return (
                  <div key={goal.id} className="glass-card glass-card-hover rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center text-xl">
                          {goal.icon}
                        </div>
                        <div>
                          <h3 className="font-semibold text-text-primary">{goal.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {daysLeft !== null && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] border ${
                                  daysLeft < 0
                                    ? "border-red-accent/20 text-red-accent"
                                    : daysLeft < 30
                                    ? "border-amber-accent/20 text-amber-accent"
                                    : "border-border-subtle text-text-muted"
                                }`}
                              >
                                {daysLeft < 0
                                  ? `Vencida hace ${Math.abs(daysLeft)}d`
                                  : `${daysLeft}d restantes`}
                              </Badge>
                            )}
                            <span className="text-xs text-text-muted">
                              {goal.contributionCount} aportes
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setContributeGoal(goal);
                            setContributeCurrency("USD");
                          }}
                          className="text-brand hover:bg-brand/10 text-xs"
                        >
                          <PiggyBank className="h-3.5 w-3.5 mr-1" />
                          Aportar
                        </Button>
                        <button
                          onClick={() => openEdit(goal)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-blue-400 hover:bg-blue-400/10 transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-accent hover:bg-red-accent/10 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex items-end justify-between">
                        <span className="text-2xl font-bold font-numbers text-text-primary">
                          ${goal.currentAmountUsd.toFixed(2)}
                        </span>
                        <span className="text-sm font-numbers text-text-muted">
                          de ${goal.targetAmountUsd.toFixed(2)} USD
                        </span>
                      </div>
                      <div className="w-full bg-surface-overlay rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            progress >= 100
                              ? "bg-brand"
                              : progress >= 75
                              ? "bg-brand"
                              : progress >= 50
                              ? "bg-blue-400"
                              : progress >= 25
                              ? "bg-amber-accent"
                              : "bg-purple-400"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-muted text-right">
                        {progress.toFixed(0)}% completado · faltan ${(goal.targetAmountUsd - goal.currentAmountUsd).toFixed(2)} USD
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Check className="h-4 w-4 text-brand" />
                Completadas
              </h2>
              {completedGoals.map((goal) => (
                <div key={goal.id} className="glass-card rounded-xl p-4 opacity-70">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-lg">
                        {goal.icon}
                      </div>
                      <div>
                        <h3 className="font-medium text-text-primary">{goal.name}</h3>
                        <p className="text-xs text-text-muted">
                          ${goal.currentAmountUsd.toFixed(2)} / ${goal.targetAmountUsd.toFixed(2)} USD
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-brand/10 text-brand border-brand/20 text-[10px]">
                        <Check className="h-3 w-3 mr-1" />
                        Completada
                      </Badge>
                      <button
                        onClick={() => handleDelete(goal.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-accent hover:bg-red-accent/10 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Contribute Dialog */}
      <Dialog
        open={!!contributeGoal}
        onOpenChange={(open) => {
          if (!open) {
            setContributeGoal(null);
            setContributeAmount("");
            setContributeNote("");
          }
        }}
      >
        <DialogContent className="glass-card border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary flex items-center gap-2">
              <span className="text-xl">{contributeGoal?.icon}</span>
              Aportar a {contributeGoal?.name}
            </DialogTitle>
          </DialogHeader>
          {contributeGoal && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-surface-raised/50">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Progreso actual</span>
                  <span className="font-numbers text-text-primary">
                    ${contributeGoal.currentAmountUsd.toFixed(2)} / ${contributeGoal.targetAmountUsd.toFixed(2)} USD
                  </span>
                </div>
                <div className="w-full bg-surface-overlay rounded-full h-2 mt-2">
                  <div
                    className="h-2 rounded-full bg-brand transition-all"
                    style={{ width: `${progressPercent(contributeGoal)}%` }}
                  />
                </div>
                <p className="text-xs text-text-muted mt-1.5">
                  Faltan ${(contributeGoal.targetAmountUsd - contributeGoal.currentAmountUsd).toFixed(2)} USD
                </p>
              </div>

              <form onSubmit={handleContribute} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs uppercase tracking-wider">Monto</Label>
                    <Input
                      type="number"
                      step="any"
                      value={contributeAmount}
                      onChange={(e) => setContributeAmount(e.target.value)}
                      placeholder="100"
                      required
                      className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl font-numbers"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs uppercase tracking-wider">Moneda</Label>
                    <Select value={contributeCurrency} onValueChange={setContributeCurrency}>
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
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Nota (opcional)</Label>
                  <Input
                    value={contributeNote}
                    onChange={(e) => setContributeNote(e.target.value)}
                    placeholder="Ej: Bonus de trabajo"
                    className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold"
                  disabled={contributeLoading}
                >
                  {contributeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aportar"}
                </Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
