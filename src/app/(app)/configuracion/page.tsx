"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Copy, RefreshCw, Check, Smartphone, Eye, EyeOff, MessageCircle, Unlink, Loader2, Webhook, Plus, Trash2 } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  apiToken: string;
  telegramChatId: string | null;
  defaultCurrency: string;
  timezone: string;
  onboardingCompleted: boolean;
}

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  secret: string | null;
  createdAt: string;
}

const TIMEZONES = [
  "America/Bogota", "America/Mexico_City", "America/Lima", "America/Santiago",
  "America/Buenos_Aires", "America/Caracas", "America/New_York", "America/Los_Angeles", "Europe/Madrid",
];

export default function ConfiguracionPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeLoading, setLinkCodeLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookAdding, setWebhookAdding] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const result = await apiClient<UserProfile>("/api/users/me");
      setProfile(result);
      setName(result.name);
    } catch (err) {
      console.error("Error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWebhooks = useCallback(async () => {
    try {
      const result = await apiClient<{ webhooks: WebhookItem[] }>("/api/webhooks");
      setWebhooks(result.webhooks);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProfile(); fetchWebhooks(); }, [fetchProfile, fetchWebhooks]);

  const handleSaveName = async () => {
    try {
      await apiClient("/api/users/me", { method: "PATCH", body: JSON.stringify({ name }) });
      toast.success("Nombre actualizado");
    } catch { toast.error("Error al actualizar el nombre"); }
  };

  const handleCurrencyChange = async (currency: string) => {
    try {
      await apiClient("/api/users/me", { method: "PATCH", body: JSON.stringify({ defaultCurrency: currency }) });
      setProfile((p) => (p ? { ...p, defaultCurrency: currency } : p));
      toast.success("Moneda actualizada");
    } catch { toast.error("Error al cambiar la moneda"); }
  };

  const handleTimezoneChange = async (tz: string) => {
    try {
      await apiClient("/api/users/me", { method: "PATCH", body: JSON.stringify({ timezone: tz }) });
      setProfile((p) => (p ? { ...p, timezone: tz } : p));
      toast.success("Zona horaria actualizada");
    } catch { toast.error("Error al cambiar la zona horaria"); }
  };

  const handleRegenerateToken = async () => {
    try {
      const result = await apiClient<{ apiToken: string }>("/api/users/me/regenerate-token", { method: "POST" });
      setProfile((p) => (p ? { ...p, apiToken: result.apiToken } : p));
      toast.success("Token regenerado");
    } catch { toast.error("Error al regenerar el token"); }
  };

  const copyToken = () => {
    if (profile) {
      navigator.clipboard.writeText(profile.apiToken);
      toast.success("Token copiado");
    }
  };

  const handleGenerateLinkCode = async () => {
    setLinkCodeLoading(true);
    try {
      const result = await apiClient<{ code: string; expiresIn: string }>("/api/telegram/link-code", { method: "POST" });
      setLinkCode(result.code);
      toast.success("Codigo generado. Tienes 10 minutos para usarlo.");
    } catch { toast.error("Error al generar el codigo"); }
    finally { setLinkCodeLoading(false); }
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookAdding(true);
    try {
      await apiClient("/api/webhooks", {
        method: "POST",
        body: JSON.stringify({ name: webhookName, url: webhookUrl, secret: webhookSecret || null }),
      });
      toast.success("Webhook creado");
      setWebhookName("");
      setWebhookUrl("");
      setWebhookSecret("");
      fetchWebhooks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear webhook");
    } finally {
      setWebhookAdding(false);
    }
  };

  const handleToggleWebhook = async (wh: WebhookItem) => {
    try {
      await apiClient(`/api/webhooks/${wh.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !wh.isActive }),
      });
      setWebhooks((prev) => prev.map((w) => w.id === wh.id ? { ...w, isActive: !w.isActive } : w));
    } catch { toast.error("Error al actualizar webhook"); }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await apiClient(`/api/webhooks/${id}`, { method: "DELETE" });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success("Webhook eliminado");
    } catch { toast.error("Error al eliminar webhook"); }
  };

  const handleUnlinkTelegram = async () => {
    setUnlinkLoading(true);
    try {
      await apiClient("/api/telegram/unlink", { method: "POST" });
      setProfile((p) => (p ? { ...p, telegramChatId: null } : p));
      toast.success("Telegram desvinculado");
    } catch { toast.error("Error al desvincular"); }
    finally { setUnlinkLoading(false); }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-surface-raised" />
        {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-40 rounded-2xl bg-surface-raised" />))}
      </div>
    );
  }

  if (!profile) return null;

  const maskedToken = `${"*".repeat(8)}...${profile.apiToken.slice(-4)}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Configuracion</h1>
        <p className="text-sm text-text-muted mt-1">Ajustes de tu cuenta y preferencias</p>
      </div>

      {/* Profile */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-text-primary">Perfil</h3>
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">Nombre</Label>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)}
              className="bg-surface-raised/50 border-border-subtle h-10 rounded-xl" />
            <Button onClick={handleSaveName} variant="outline" size="sm"
              className="border-brand/20 text-brand hover:bg-brand/10 h-10 px-3">
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">Email</Label>
          <Input value={profile.email} disabled
            className="bg-surface-raised/30 border-border-subtle h-10 rounded-xl text-text-muted" />
        </div>
      </div>

      {/* API Token */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">API Token</h3>
          <p className="text-xs text-text-muted mt-1">Usa este token para conectar iOS Shortcuts</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={showToken ? profile.apiToken : maskedToken}
            readOnly
            className="font-mono text-sm bg-surface-raised/30 border-border-subtle h-10 rounded-xl text-text-secondary"
          />
          <Button variant="outline" size="sm" onClick={() => setShowToken(!showToken)}
            className="border-border-subtle text-text-muted hover:text-text-secondary h-10 px-3">
            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={copyToken}
            className="border-border-subtle text-text-muted hover:text-text-secondary h-10 px-3">
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleRegenerateToken}
            className="border-border-subtle text-text-muted hover:text-amber-accent h-10 px-3">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Telegram */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-400/10 rounded-xl">
            <MessageCircle className="h-4 w-4 text-purple-400" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">Telegram</h3>
        </div>
        {profile.telegramChatId ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center">
                <Check className="h-3 w-3 text-brand" />
              </div>
              <span className="text-sm text-brand font-medium">Vinculado</span>
              <span className="text-xs text-text-muted">(Chat ID: {profile.telegramChatId})</span>
            </div>
            <Button onClick={handleUnlinkTelegram} variant="outline" size="sm" disabled={unlinkLoading}
              className="border-red-500/20 text-red-400 hover:bg-red-500/10">
              {unlinkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlink className="h-4 w-4 mr-2" />}
              Desvincular
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Vincula tu cuenta para registrar gastos desde Telegram.</p>
            <div className="p-4 rounded-xl bg-surface-raised/50 border border-border-subtle space-y-3">
              <ol className="text-sm text-text-muted space-y-2 list-decimal list-inside">
                <li>Busca el bot en Telegram</li>
                <li>Envia <span className="font-mono text-brand">/start</span></li>
                <li>Genera tu codigo aqui y envialo al bot</li>
              </ol>
            </div>
            {linkCode ? (
              <div className="flex items-center gap-3">
                <div className="px-5 py-3 rounded-xl bg-surface-raised border border-brand/20">
                  <span className="font-mono text-2xl font-bold tracking-[0.3em] text-brand">{linkCode}</span>
                </div>
                <span className="text-xs text-text-muted">Expira en 10 min</span>
              </div>
            ) : (
              <Button onClick={handleGenerateLinkCode} disabled={linkCodeLoading}
                className="bg-brand hover:bg-brand-light text-black font-semibold">
                {linkCodeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                Generar codigo de vinculacion
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Preferences */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-text-primary">Preferencias</h3>
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">Moneda por defecto</Label>
          <Select value={profile.defaultCurrency} onValueChange={handleCurrencyChange}>
            <SelectTrigger className="w-52 bg-surface-raised/50 border-border-subtle h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-overlay border-border-subtle">
              <SelectItem value="COP">COP (Peso colombiano)</SelectItem>
              <SelectItem value="USD">USD (Dolar)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-px bg-border-subtle" />
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">Zona horaria</Label>
          <Select value={profile.timezone} onValueChange={handleTimezoneChange}>
            <SelectTrigger className="w-60 bg-surface-raised/50 border-border-subtle h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-overlay border-border-subtle">
              {TIMEZONES.map((tz) => (<SelectItem key={tz} value={tz}>{tz}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Webhooks */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-accent/10 rounded-xl">
            <Webhook className="h-4 w-4 text-amber-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Webhooks</h3>
            <p className="text-xs text-text-muted">Recibe notificaciones cuando se registre un gasto</p>
          </div>
        </div>

        {webhooks.length > 0 && (
          <div className="space-y-2">
            {webhooks.map((wh) => (
              <div key={wh.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-raised/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">{wh.name}</p>
                  <p className="text-xs text-text-muted font-mono truncate">{wh.url}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <Switch checked={wh.isActive} onCheckedChange={() => handleToggleWebhook(wh)} className="scale-75" />
                  <button onClick={() => handleDeleteWebhook(wh.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-red-accent hover:bg-red-accent/10 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddWebhook} className="space-y-3 pt-2 border-t border-border-subtle">
          <div className="grid grid-cols-2 gap-2">
            <Input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} placeholder="Nombre" required
              className="bg-surface-raised/50 border-border-subtle h-9 rounded-xl text-sm" />
            <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://..." type="url" required
              className="bg-surface-raised/50 border-border-subtle h-9 rounded-xl text-sm font-mono" />
          </div>
          <div className="flex gap-2">
            <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Secret (opcional)"
              className="bg-surface-raised/50 border-border-subtle h-9 rounded-xl text-sm font-mono" />
            <Button type="submit" size="sm" disabled={webhookAdding}
              className="bg-brand hover:bg-brand-dark text-white shrink-0 h-9">
              {webhookAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </form>
      </div>

      {/* iOS Shortcut Guide */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-400/10 rounded-xl">
            <Smartphone className="h-4 w-4 text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">iOS Shortcut (Apple Pay)</h3>
        </div>
        <p className="text-sm text-text-secondary">
          Configura una automatizacion para registrar gastos automaticamente cada vez que uses Apple Pay:
        </p>
        <div className="p-4 rounded-xl bg-surface-raised/50 border border-border-subtle">
          <ol className="text-sm text-text-muted space-y-2.5 list-decimal list-inside">
            <li>Abre la app <strong className="text-text-secondary">Atajos</strong> en tu iPhone</li>
            <li>Ve a <strong className="text-text-secondary">Automatizacion</strong> &gt; <strong className="text-text-secondary">+</strong> &gt; <strong className="text-text-secondary">Automatizacion personal</strong></li>
            <li>Selecciona <strong className="text-text-secondary">&quot;Cuando Apple Pay se use&quot;</strong></li>
            <li>Agrega accion <strong className="text-text-secondary">&quot;Obtener contenido de URL&quot;</strong></li>
            <li>Configura:
              <ul className="ml-4 mt-2 space-y-1.5">
                <li>URL: <code className="bg-surface-overlay px-2 py-0.5 rounded-md text-xs font-mono text-brand">{typeof window !== "undefined" ? window.location.origin : ""}/api/expenses/shortcut</code></li>
                <li>Metodo: <strong className="text-text-secondary">POST</strong></li>
                <li>Headers: <code className="bg-surface-overlay px-2 py-0.5 rounded-md text-xs font-mono text-text-muted">Authorization: Bearer {maskedToken}</code></li>
                <li>Body (JSON): <code className="bg-surface-overlay px-2 py-0.5 rounded-md text-xs font-mono text-text-muted">{`{ "merchant": "Nombre", "amount": 50000 }`}</code></li>
              </ul>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
