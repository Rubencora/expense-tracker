"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

interface Expense {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  amountUsd: number;
  descriptionAi: string | null;
  source: string;
  createdAt: string;
  category: Category;
  space: { id: string; name: string } | null;
  user: { id: string; name: string };
}

interface SpaceInfo {
  id: string;
  name: string;
}

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSpace, setSelectedSpace] = useState("all");
  const [period, setPeriod] = useState("month");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const [newMerchant, setNewMerchant] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState("COP");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.set("categoryId", selectedCategory);
      if (selectedSpace !== "all") params.set("spaceId", selectedSpace);
      if (search) params.set("search", search);

      const now = new Date();
      if (period === "today") {
        params.set("dateFrom", new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
      } else if (period === "week") {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        params.set("dateFrom", weekAgo.toISOString());
      } else if (period === "month") {
        params.set("dateFrom", new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
      }

      params.set("limit", "100");

      const result = await apiClient<{ expenses: Expense[] }>(
        `/api/expenses?${params.toString()}`
      );
      setExpenses(result.expenses);
    } catch (err) {
      console.error("Error fetching expenses:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedSpace, search, period]);

  useEffect(() => {
    apiClient<Category[]>("/api/categories").then(setCategories);
    apiClient<{ spaces: SpaceInfo[] }>("/api/spaces").then((res) =>
      setSpaces(res.spaces)
    );
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/expenses/${id}`, { method: "DELETE" });
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      toast.success("Gasto eliminado");
    } catch {
      toast.error("Error al eliminar el gasto");
    }
  };

  const handleCategoryChange = async (expenseId: string, categoryId: string) => {
    try {
      const updated = await apiClient<Expense>(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        body: JSON.stringify({ categoryId }),
      });
      setExpenses((prev) =>
        prev.map((e) => (e.id === expenseId ? { ...e, category: updated.category } : e))
      );
      toast.success("Categoria actualizada");
    } catch {
      toast.error("Error al cambiar la categoria");
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient<Expense>("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          merchant: newMerchant,
          amount: parseFloat(newAmount),
          currency: newCurrency,
          categoryId: newCategoryId,
        }),
      });
      toast.success("Gasto registrado");
      setShowAddDialog(false);
      setNewMerchant("");
      setNewAmount("");
      setNewCategoryId("");
      fetchExpenses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el gasto");
    } finally {
      setSubmitting(false);
    }
  };

  const exportToExcel = () => {
    const data = expenses.map((e) => ({
      Comercio: e.merchant,
      Monto: e.amount,
      Moneda: e.currency,
      "Monto USD": e.amountUsd,
      Categoria: `${e.category.emoji} ${e.category.name}`,
      Espacio: e.space?.name || "Personal",
      Fuente: e.source,
      Fecha: new Date(e.createdAt).toLocaleDateString("es-CO"),
      Descripcion: e.descriptionAi || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos");
    XLSX.writeFile(wb, "gastos.xlsx");
    toast.success("Archivo Excel descargado");
  };

  const formatAmount = (amount: number, currency: string) => {
    if (currency === "COP") {
      return `$${amount.toLocaleString("es-CO")} COP`;
    }
    return `$${amount.toFixed(2)} USD`;
  };

  const sourceStyles: Record<string, string> = {
    web: "bg-blue-400/10 text-blue-400 border-blue-400/20",
    telegram: "bg-purple-400/10 text-purple-400 border-purple-400/20",
    shortcut: "bg-amber-accent/10 text-amber-accent border-amber-accent/20",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Gastos</h1>
          <p className="text-sm text-text-muted mt-1">
            {expenses.length} gastos registrados
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            disabled={expenses.length === 0}
            className="border-brand/20 text-brand hover:bg-brand/10 hover:text-brand-light"
          >
            <Download className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-brand hover:bg-brand-dark text-white">
                <Plus className="h-4 w-4 mr-1" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border-subtle">
              <DialogHeader>
                <DialogTitle className="text-text-primary">Registrar gasto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Comercio</Label>
                  <Input value={newMerchant} onChange={(e) => setNewMerchant(e.target.value)} placeholder="Ej: Exito, Uber, Netflix" required
                    className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs uppercase tracking-wider">Monto</Label>
                    <Input type="number" step="any" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="53000" required
                      className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl font-numbers" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-text-secondary text-xs uppercase tracking-wider">Moneda</Label>
                    <Select value={newCurrency} onValueChange={setNewCurrency}>
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
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Categoria</Label>
                  <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                    <SelectTrigger className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl">
                      <SelectValue placeholder="Selecciona categoria" />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-overlay border-border-subtle">
                      {categories.filter((c) => c.id).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar gasto"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Tabs value={selectedSpace} onValueChange={setSelectedSpace}>
          <TabsList className="bg-surface-raised border border-border-subtle">
            <TabsTrigger value="all" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">Todos</TabsTrigger>
            <TabsTrigger value="personal" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">Personal</TabsTrigger>
            {spaces.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">{s.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Input placeholder="Buscar comercio..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-40 bg-surface-raised border-border-subtle rounded-xl" />

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-40 bg-surface-raised border-border-subtle">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-border-subtle">
            <SelectItem value="all">Todas</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36 bg-surface-raised border-border-subtle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-border-subtle">
            <SelectItem value="today">Hoy</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mes</SelectItem>
            <SelectItem value="all">Todo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expenses List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl bg-surface-raised" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🧾</span>
          </div>
          <p className="text-text-secondary text-lg font-medium">No hay gastos</p>
          <p className="text-text-muted text-sm mt-2">Registra tu primer gasto con el boton &quot;Nuevo&quot;</p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {expenses.map((expense) => (
            <div key={expense.id} className="glass-card glass-card-hover rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{expense.category.emoji}</span>
                    <span className="font-semibold text-text-primary truncate">
                      {expense.merchant}
                    </span>
                    <Badge variant="outline" className={`text-[10px] shrink-0 border ${sourceStyles[expense.source.toLowerCase()] || "border-border-subtle text-text-muted"}`}>
                      {expense.source.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <span>{expense.user.name}</span>
                    <span className="opacity-30">·</span>
                    <span>
                      {new Date(expense.createdAt).toLocaleDateString("es-CO", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Select value={expense.category.id} onValueChange={(val) => handleCategoryChange(expense.id, val)}>
                      <SelectTrigger className="h-7 text-xs w-fit bg-surface-overlay/50 border-border-subtle rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-overlay border-border-subtle">
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {expense.descriptionAi && (
                    <p className="text-xs text-text-muted italic mt-1">{expense.descriptionAi}</p>
                  )}
                  {expense.space && (
                    <p className="text-xs text-text-muted mt-1">Espacio: {expense.space.name}</p>
                  )}
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="font-bold text-lg font-numbers text-text-primary">
                    {formatAmount(expense.amount, expense.currency)}
                  </p>
                  {expense.currency !== "USD" && (
                    <p className="text-xs font-numbers text-text-muted">
                      ${expense.amountUsd.toFixed(2)} USD
                    </p>
                  )}
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="mt-2 p-1.5 rounded-lg text-text-muted hover:text-red-accent hover:bg-red-accent/10 transition-all"
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
  );
}
