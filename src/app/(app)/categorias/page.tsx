"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Loader2 } from "lucide-react";

interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmoji, setFormEmoji] = useState("");
  const [formColor, setFormColor] = useState("#10B981");
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = async () => {
    try {
      const result = await apiClient<Category[]>("/api/categories");
      setCategories(result);
    } catch (err) {
      console.error("Error fetching categories:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: formName, emoji: formEmoji, color: formColor }),
      });
      toast.success("Categoria creada");
      setShowAddDialog(false);
      resetForm();
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear categoria");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCategory) return;
    setSubmitting(true);
    try {
      await apiClient(`/api/categories/${editCategory.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: formName, emoji: formEmoji, color: formColor }),
      });
      toast.success("Categoria actualizada");
      setEditCategory(null);
      resetForm();
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al editar categoria");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    try {
      await apiClient(`/api/categories/${cat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      toast.success(cat.isActive ? "Categoria desactivada" : "Categoria activada");
      fetchCategories();
    } catch {
      toast.error("Error al cambiar el estado");
    }
  };

  const openEdit = (cat: Category) => {
    setFormName(cat.name);
    setFormEmoji(cat.emoji);
    setFormColor(cat.color);
    setEditCategory(cat);
  };

  const resetForm = () => {
    setFormName("");
    setFormEmoji("");
    setFormColor("#10B981");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40 bg-surface-raised" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl bg-surface-raised" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Categorias</h1>
          <p className="text-sm text-text-muted mt-1">Organiza tus gastos por categoria</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-brand hover:bg-brand-dark text-white">
              <Plus className="h-4 w-4 mr-1" />
              Nueva
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card border-border-subtle">
            <DialogHeader>
              <DialogTitle className="text-text-primary">Nueva categoria</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Nombre</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Mascotas" required
                  className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Emoji</Label>
                  <Input value={formEmoji} onChange={(e) => setFormEmoji(e.target.value)} placeholder="🐾" required
                    className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl text-center text-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-text-secondary text-xs uppercase tracking-wider">Color</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)}
                      className="w-12 h-11 p-1.5 cursor-pointer rounded-xl bg-surface-raised/50 border-border-subtle" />
                    <Input value={formColor} onChange={(e) => setFormColor(e.target.value)} placeholder="#10B981"
                      className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl font-mono text-sm" />
                  </div>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear categoria"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editCategory} onOpenChange={(open) => { if (!open) { setEditCategory(null); resetForm(); } }}>
        <DialogContent className="glass-card border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Editar categoria</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-text-secondary text-xs uppercase tracking-wider">Nombre</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} required
                className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Emoji</Label>
                <Input value={formEmoji} onChange={(e) => setFormEmoji(e.target.value)} required
                  className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl text-center text-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-text-secondary text-xs uppercase tracking-wider">Color</Label>
                <div className="flex gap-2">
                  <Input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)}
                    className="w-12 h-11 p-1.5 cursor-pointer rounded-xl bg-surface-raised/50 border-border-subtle" />
                  <Input value={formColor} onChange={(e) => setFormColor(e.target.value)}
                    className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl font-mono text-sm" />
                </div>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Categories List */}
      <div className="space-y-2 stagger-children">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={`glass-card glass-card-hover rounded-xl p-4 flex items-center justify-between transition-opacity ${
              !cat.isActive ? "opacity-40" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ backgroundColor: cat.color + "18" }}>
                {cat.emoji}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{cat.name}</span>
                  {cat.isDefault && (
                    <Badge variant="secondary" className="text-[10px] bg-surface-overlay text-text-muted border border-border-subtle">
                      Default
                    </Badge>
                  )}
                </div>
              </div>
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleActive(cat)}
                className="text-xs text-text-muted hover:text-text-secondary"
              >
                {cat.isActive ? "Desactivar" : "Activar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(cat)}
                className="text-text-muted hover:text-text-secondary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
