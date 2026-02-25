"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient, getUser } from "@/lib/api-client";
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
import { Plus, Trash2, Download, Upload, Loader2, Split, Pencil } from "lucide-react";
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
  splitType: string | null;
  createdAt: string;
  category: Category;
  space: { id: string; name: string } | null;
  user: { id: string; name: string };
}

interface Tag {
  id: string;
  name: string;
  color: string;
  expenseCount: number;
}

interface SpaceInfo {
  id: string;
  name: string;
}

interface SpaceMember {
  userId: string;
  name: string;
  role: string;
}

type SplitTypeOption = "equal" | "percentage" | "exact" | "solo";

const SPLIT_LABELS: Record<SplitTypeOption, string> = {
  equal: "Partes iguales",
  percentage: "Porcentaje",
  exact: "Montos exactos",
  solo: "Solo yo",
};

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
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState("all");
  const [newExpenseTags, setNewExpenseTags] = useState<string[]>([]);
  const [suggestedTagIds, setSuggestedTagIds] = useState<string[]>([]);
  const [expenseTagsMap, setExpenseTagsMap] = useState<Record<string, { id: string; name: string; color: string }[]>>({});

  const [newMerchant, setNewMerchant] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState("COP");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<{ merchant: string; amount: number; currency: string; categoryId: string; date?: string }[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Edit state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editMerchant, setEditMerchant] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("COP");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Split state
  const [splitType, setSplitType] = useState<SplitTypeOption>("equal");
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [percentShares, setPercentShares] = useState<Record<string, string>>({});
  const [exactShares, setExactShares] = useState<Record<string, string>>({});

  const isSharedSpace = selectedSpace && selectedSpace !== "all" && selectedSpace !== "personal";

  // Fetch members when a shared space is selected for the add dialog
  useEffect(() => {
    if (isSharedSpace && showAddDialog) {
      apiClient<SpaceMember[]>(`/api/spaces/${selectedSpace}/members`).then((members) => {
        setSpaceMembers(members);
        const initial: Record<string, string> = {};
        members.forEach((m) => {
          initial[m.userId] = "";
        });
        setPercentShares(initial);
        setExactShares(initial);
      });
    }
  }, [isSharedSpace, selectedSpace, showAddDialog]);

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

      // After expenses are loaded, fetch their tags
      if (result.expenses.length > 0) {
        const tagPromises = result.expenses.map((e) =>
          apiClient<{ id: string; name: string; color: string }[]>(
            `/api/expenses/${e.id}/tags`
          ).catch(() => [] as { id: string; name: string; color: string }[])
        );
        const tagResults = await Promise.all(tagPromises);
        const tagMap: Record<string, { id: string; name: string; color: string }[]> = {};
        result.expenses.forEach((e, i) => {
          tagMap[e.id] = tagResults[i] || [];
        });
        setExpenseTagsMap(tagMap);
      } else {
        setExpenseTagsMap({});
      }
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
    apiClient<Tag[]>("/api/tags").then(setTags);
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // Auto-suggest tags when merchant is typed (debounced)
  useEffect(() => {
    if (newMerchant.length < 2) {
      setSuggestedTagIds([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient<{ suggestions: string[] }>(
          `/api/tags/suggestions?merchant=${encodeURIComponent(newMerchant)}`
        );
        setSuggestedTagIds(res.suggestions);
        // Auto-select suggested tags that aren't already selected
        if (res.suggestions.length > 0 && newExpenseTags.length === 0) {
          setNewExpenseTags(res.suggestions);
        }
      } catch {
        // Silently ignore suggestion errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [newMerchant]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este gasto?")) return;
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

  const openEditDialog = (expense: Expense) => {
    setEditingExpense(expense);
    setEditMerchant(expense.merchant);
    setEditAmount(String(expense.amount));
    setEditCurrency(expense.currency);
    setEditCategoryId(expense.category.id);
  };

  const handleEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    setEditSubmitting(true);
    try {
      const updated = await apiClient<Expense>(`/api/expenses/${editingExpense.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          merchant: editMerchant,
          amount: parseFloat(editAmount),
          currency: editCurrency,
          categoryId: editCategoryId,
        }),
      });
      setExpenses((prev) =>
        prev.map((exp) => (exp.id === editingExpense.id ? { ...exp, ...updated } : exp))
      );
      toast.success("Gasto actualizado");
      setEditingExpense(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const expenseData: Record<string, unknown> = {
        merchant: newMerchant,
        amount: parseFloat(newAmount),
        currency: newCurrency,
        categoryId: newCategoryId,
      };
      if (isSharedSpace) {
        expenseData.spaceId = selectedSpace;

        // Build split data
        if (splitType === "equal" || splitType === "solo") {
          expenseData.split = { type: splitType };
        } else if (splitType === "percentage") {
          const shares = Object.entries(percentShares)
            .filter(([, v]) => parseFloat(v) > 0)
            .map(([userId, v]) => ({ userId, percentage: parseFloat(v) }));
          const total = shares.reduce((s, sh) => s + sh.percentage, 0);
          if (Math.abs(total - 100) > 0.01) {
            toast.error("Los porcentajes deben sumar 100%");
            setSubmitting(false);
            return;
          }
          expenseData.split = { type: "percentage", shares };
        } else if (splitType === "exact") {
          const shares = Object.entries(exactShares)
            .filter(([, v]) => parseFloat(v) > 0)
            .map(([userId, v]) => ({ userId, amount: parseFloat(v) }));
          expenseData.split = { type: "exact", shares };
        }
      }

      const created = await apiClient<Expense>("/api/expenses", {
        method: "POST",
        body: JSON.stringify(expenseData),
      });

      // Assign tags to the new expense
      if (newExpenseTags.length > 0) {
        await Promise.all(
          newExpenseTags.map(tagId =>
            apiClient(`/api/expenses/${created.id}/tags`, {
              method: "POST",
              body: JSON.stringify({ tagId }),
            })
          )
        );
      }

      toast.success("Gasto registrado");
      setShowAddDialog(false);
      setNewMerchant("");
      setNewAmount("");
      setNewCategoryId("");
      setNewExpenseTags([]);
      setSuggestedTagIds([]);
      setSplitType("equal");
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      // Map columns (flexible: supports Spanish or English headers)
      const mapped = rows.map((row) => {
        const merchant = String(row.Comercio || row.merchant || row.Merchant || row.comercio || "").trim();
        const rawAmount = row.Monto || row.amount || row.Amount || row.monto || 0;
        const amount = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount).replace(/[^0-9.\-]/g, ""));
        const rawCurrency = String(row.Moneda || row.currency || row.Currency || row.moneda || "COP").toUpperCase().trim();
        const currency = rawCurrency === "USD" ? "USD" : "COP";
        const rawDate = row.Fecha || row.date || row.Date || row.fecha || "";
        const date = rawDate ? String(rawDate) : undefined;

        // Try to match category by name
        const catName = String(row.Categoria || row.category || row.Category || row.categoria || "").replace(/^\S+\s*/, "").trim();
        const matchedCat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
        const categoryId = matchedCat?.id || categories[0]?.id || "";

        return { merchant, amount, currency, categoryId, date };
      }).filter((r) => r.merchant && r.amount > 0);

      setUploadPreview(mapped);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkUpload = async () => {
    if (uploadPreview.length === 0) return;
    setUploading(true);
    try {
      const result = await apiClient<{ created: number; errors: string[] }>("/api/expenses/bulk", {
        method: "POST",
        body: JSON.stringify({ expenses: uploadPreview }),
      });
      toast.success(`${result.created} gastos importados`);
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} filas con errores`);
      }
      setShowUploadDialog(false);
      setUploadPreview([]);
      setUploadFile(null);
      fetchExpenses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      { Comercio: "Exito", Monto: 85000, Moneda: "COP", Categoria: "Mercado", Fecha: "2026-02-24" },
      { Comercio: "Netflix", Monto: 15.99, Moneda: "USD", Categoria: "Entretenimiento", Fecha: "2026-02-23" },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "plantilla-gastos.xlsx");
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

  const splitTypeStyles: Record<string, string> = {
    EQUAL: "bg-blue-400/10 text-blue-400 border-blue-400/20",
    PERCENTAGE: "bg-purple-400/10 text-purple-400 border-purple-400/20",
    EXACT: "bg-amber-accent/10 text-amber-accent border-amber-accent/20",
    SOLO: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
  };

  const splitTypeLabels: Record<string, string> = {
    EQUAL: "dividido",
    PERCENTAGE: "% custom",
    EXACT: "montos",
    SOLO: "solo yo",
  };

  // Split preview calculations
  const currentUser = getUser();
  const parsedAmount = parseFloat(newAmount) || 0;
  const memberCount = spaceMembers.length;
  const equalShare = memberCount > 0 ? parsedAmount / memberCount : 0;

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
          <Dialog open={showUploadDialog} onOpenChange={(open) => {
            setShowUploadDialog(open);
            if (!open) { setUploadPreview([]); setUploadFile(null); }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-brand/20 text-brand hover:bg-brand/10 hover:text-brand-light">
                <Upload className="h-4 w-4 mr-1" />
                Importar
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border-subtle max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-text-primary">Importar gastos desde Excel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs text-text-muted">
                    Sube un archivo Excel (.xlsx) con columnas: <strong>Comercio, Monto, Moneda</strong> (COP/USD), <strong>Categoria, Fecha</strong> (opcional).
                  </p>
                  <button type="button" onClick={downloadTemplate} className="text-xs text-brand hover:underline">
                    Descargar plantilla de ejemplo
                  </button>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="block w-full text-sm text-text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand/10 file:text-brand hover:file:bg-brand/20 file:cursor-pointer"
                />
                {uploadPreview.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-text-secondary font-medium">
                      {uploadPreview.length} gastos listos para importar
                    </p>
                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                      {uploadPreview.slice(0, 20).map((row, i) => {
                        const cat = categories.find((c) => c.id === row.categoryId);
                        return (
                          <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-surface-raised/50">
                            <div className="flex items-center gap-2 min-w-0">
                              <span>{cat?.emoji || "📦"}</span>
                              <span className="text-text-primary truncate">{row.merchant}</span>
                            </div>
                            <span className="font-numbers text-text-primary shrink-0 ml-2">
                              {row.currency === "COP" ? `$${row.amount.toLocaleString("es-CO")}` : `$${row.amount.toFixed(2)}`} {row.currency}
                            </span>
                          </div>
                        );
                      })}
                      {uploadPreview.length > 20 && (
                        <p className="text-xs text-text-muted text-center">...y {uploadPreview.length - 20} mas</p>
                      )}
                    </div>
                    <Button
                      onClick={handleBulkUpload}
                      disabled={uploading}
                      className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Importar ${uploadPreview.length} gastos`}
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddDialog} onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open) {
              setSplitType("equal");
              setNewExpenseTags([]);
              setSuggestedTagIds([]);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-brand hover:bg-brand-dark text-white">
                <Plus className="h-4 w-4 mr-1" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="glass-card border-border-subtle max-h-[90vh] overflow-y-auto">
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

                {tags.length > 0 && (() => {
                  const sortedTags = [...tags].sort((a, b) => {
                    const aIsSuggested = suggestedTagIds.includes(a.id);
                    const bIsSuggested = suggestedTagIds.includes(b.id);
                    if (aIsSuggested && !bIsSuggested) return -1;
                    if (!aIsSuggested && bIsSuggested) return 1;
                    return 0;
                  });
                  return (
                    <div className="space-y-2">
                      <Label className="text-text-secondary text-xs uppercase tracking-wider">
                        Etiquetas
                        {suggestedTagIds.length > 0 && (
                          <span className="ml-2 text-[10px] text-brand/70 normal-case tracking-normal font-normal">sugerencias aplicadas</span>
                        )}
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {sortedTags.map((t) => (
                          <button key={t.id} type="button"
                            onClick={() => setNewExpenseTags(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                              newExpenseTags.includes(t.id) ? "border-brand/30 bg-brand/10 text-brand" : "border-border-subtle bg-surface-raised/50 text-text-muted hover:border-border-subtle/80"
                            }`}>
                            {t.name}
                            {suggestedTagIds.includes(t.id) && <span className="ml-1 text-[9px] opacity-60">{"\u2726"}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Split Section - only for shared spaces */}
                {isSharedSpace && spaceMembers.length > 1 && (
                  <div className="space-y-3 pt-2 border-t border-border-subtle">
                    <div className="flex items-center gap-2">
                      <Split className="h-4 w-4 text-text-muted" />
                      <Label className="text-text-secondary text-xs uppercase tracking-wider">Dividir gasto</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["equal", "percentage", "exact", "solo"] as SplitTypeOption[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSplitType(type)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                            splitType === type
                              ? "bg-brand/10 text-brand border-brand/30"
                              : "bg-surface-raised/50 text-text-muted border-border-subtle hover:border-border-subtle/80"
                          }`}
                        >
                          {SPLIT_LABELS[type]}
                        </button>
                      ))}
                    </div>

                    {/* Equal split preview */}
                    {splitType === "equal" && parsedAmount > 0 && (
                      <div className="bg-surface-raised/50 rounded-xl p-3 space-y-1.5">
                        <p className="text-xs text-text-muted">
                          Dividido entre {memberCount} miembros:
                        </p>
                        {spaceMembers.map((m) => (
                          <div key={m.userId} className="flex justify-between text-xs">
                            <span className="text-text-secondary">
                              {m.userId === currentUser?.id ? "Tu" : m.name}
                            </span>
                            <span className="font-numbers text-text-primary">
                              {formatAmount(equalShare, newCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Percentage split */}
                    {splitType === "percentage" && (
                      <div className="bg-surface-raised/50 rounded-xl p-3 space-y-2">
                        {spaceMembers.map((m) => (
                          <div key={m.userId} className="flex items-center gap-2">
                            <span className="text-xs text-text-secondary flex-1">
                              {m.userId === currentUser?.id ? "Tu" : m.name}
                            </span>
                            <Input
                              type="number"
                              step="any"
                              placeholder="0"
                              value={percentShares[m.userId] || ""}
                              onChange={(e) => setPercentShares((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                              className="w-20 h-8 text-xs font-numbers bg-surface-overlay border-border-subtle rounded-lg text-right"
                            />
                            <span className="text-xs text-text-muted">%</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs pt-1 border-t border-border-subtle/50">
                          <span className="text-text-muted">Total</span>
                          <span className={`font-numbers font-medium ${
                            Math.abs(Object.values(percentShares).reduce((s, v) => s + (parseFloat(v) || 0), 0) - 100) < 0.01
                              ? "text-brand" : "text-red-accent"
                          }`}>
                            {Object.values(percentShares).reduce((s, v) => s + (parseFloat(v) || 0), 0).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Exact split */}
                    {splitType === "exact" && (
                      <div className="bg-surface-raised/50 rounded-xl p-3 space-y-2">
                        {spaceMembers.filter((m) => m.userId !== currentUser?.id).map((m) => (
                          <div key={m.userId} className="flex items-center gap-2">
                            <span className="text-xs text-text-secondary flex-1">{m.name}</span>
                            <span className="text-xs text-text-muted">$</span>
                            <Input
                              type="number"
                              step="any"
                              placeholder="0"
                              value={exactShares[m.userId] || ""}
                              onChange={(e) => setExactShares((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                              className="w-24 h-8 text-xs font-numbers bg-surface-overlay border-border-subtle rounded-lg text-right"
                            />
                            <span className="text-xs text-text-muted">{newCurrency}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {splitType === "solo" && (
                      <p className="text-xs text-text-muted italic">
                        El gasto queda en el espacio compartido pero no se divide.
                      </p>
                    )}
                  </div>
                )}

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

        <Select value={selectedTag} onValueChange={setSelectedTag}>
          <SelectTrigger className="w-36 bg-surface-raised border-border-subtle">
            <SelectValue placeholder="Etiqueta" />
          </SelectTrigger>
          <SelectContent className="bg-surface-overlay border-border-subtle">
            <SelectItem value="all">Todas</SelectItem>
            {tags.map(t => <SelectItem key={t.id} value={t.id}>{"\uD83C\uDFF7\uFE0F"} {t.name}</SelectItem>)}
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
                    {expense.splitType && (
                      <Badge variant="outline" className={`text-[10px] shrink-0 border ${splitTypeStyles[expense.splitType] || "border-border-subtle text-text-muted"}`}>
                        {splitTypeLabels[expense.splitType] || expense.splitType}
                      </Badge>
                    )}
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
                    {expense.user.id === currentUser?.id ? (
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
                    ) : (
                      <span className="inline-flex items-center h-7 px-2.5 text-xs rounded-lg bg-surface-overlay/50 border border-border-subtle text-text-muted">
                        {expense.category.emoji} {expense.category.name}
                      </span>
                    )}
                  </div>
                  {expense.descriptionAi && (
                    <p className="text-xs text-text-muted italic mt-1">{expense.descriptionAi}</p>
                  )}
                  {expenseTagsMap[expense.id]?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {expenseTagsMap[expense.id].map((tag) => (
                        <span
                          key={tag.id}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
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
                  {expense.user.id === currentUser?.id && (
                    <div className="flex gap-1 mt-2 justify-end">
                      <button
                        onClick={() => openEditDialog(expense)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-brand hover:bg-brand/10 transition-all"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-accent hover:bg-red-accent/10 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => { if (!open) setEditingExpense(null); }}>
        <DialogContent className="glass-card border-border-subtle max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Editar gasto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditExpense} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-text-secondary text-xs uppercase tracking-wider">Comercio</Label>
              <Input value={editMerchant} onChange={(e) => setEditMerchant(e.target.value)} required
                className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Monto</Label>
                <Input type="number" step="any" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} required
                  className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl font-numbers" />
              </div>
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Moneda</Label>
                <Select value={editCurrency} onValueChange={setEditCurrency}>
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
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
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
            <Button type="submit" className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold" disabled={editSubmitting}>
              {editSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
