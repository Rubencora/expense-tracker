"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { useTranslation, type Locale } from "@/lib/i18n";
import { useTheme } from "next-themes";
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
import { Copy, RefreshCw, Check, Smartphone, Eye, EyeOff, MessageCircle, Unlink, Loader2, Webhook, Plus, Trash2, Bell, BellOff, Sun, Moon, Globe, Lock } from "lucide-react";

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
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Check push notification support on mount
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
      // Register service worker
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const handleTogglePush = async () => {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await apiClient("/api/push/subscribe", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        toast.success(t("settings.pushDisabled"));
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        const subJson = sub.toJSON();
        await apiClient("/api/push/subscribe", {
          method: "POST",
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: {
              p256dh: subJson.keys?.p256dh,
              auth: subJson.keys?.auth,
            },
          }),
        });
        setPushEnabled(true);
        toast.success(t("settings.pushEnabled"));
      }
    } catch (err) {
      console.error("Push toggle error:", err);
      toast.error(t("common.error"));
    } finally {
      setPushLoading(false);
    }
  };

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
      toast.success(t("settings.nameUpdated"));
    } catch { toast.error(t("common.error")); }
  };

  const handleCurrencyChange = async (currency: string) => {
    try {
      await apiClient("/api/users/me", { method: "PATCH", body: JSON.stringify({ defaultCurrency: currency }) });
      setProfile((p) => (p ? { ...p, defaultCurrency: currency } : p));
      toast.success(t("settings.currencyUpdated"));
    } catch { toast.error(t("common.error")); }
  };

  const handleTimezoneChange = async (tz: string) => {
    try {
      await apiClient("/api/users/me", { method: "PATCH", body: JSON.stringify({ timezone: tz }) });
      setProfile((p) => (p ? { ...p, timezone: tz } : p));
      toast.success(t("settings.timezoneUpdated"));
    } catch { toast.error(t("common.error")); }
  };

  const handleRegenerateToken = async () => {
    try {
      const result = await apiClient<{ apiToken: string }>("/api/users/me/regenerate-token", { method: "POST" });
      setProfile((p) => (p ? { ...p, apiToken: result.apiToken } : p));
      toast.success(t("settings.tokenRegenerated"));
    } catch { toast.error(t("common.error")); }
  };

  const copyToken = () => {
    if (profile) {
      navigator.clipboard.writeText(profile.apiToken);
      toast.success(t("settings.tokenCopied"));
    }
  };

  const handleGenerateLinkCode = async () => {
    setLinkCodeLoading(true);
    try {
      const result = await apiClient<{ code: string; expiresIn: string }>("/api/telegram/link-code", { method: "POST" });
      setLinkCode(result.code);
      toast.success(t("settings.codeGenerated"));
    } catch { toast.error(t("common.error")); }
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
      toast.success(t("settings.webhookCreated"));
      setWebhookName("");
      setWebhookUrl("");
      setWebhookSecret("");
      fetchWebhooks();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
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
    } catch { toast.error(t("common.error")); }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      await apiClient(`/api/webhooks/${id}`, { method: "DELETE" });
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success(t("settings.webhookDeleted"));
    } catch { toast.error(t("common.error")); }
  };

  const handleUnlinkTelegram = async () => {
    setUnlinkLoading(true);
    try {
      await apiClient("/api/telegram/unlink", { method: "POST" });
      setProfile((p) => (p ? { ...p, telegramChatId: null } : p));
      toast.success(t("settings.unlinked"));
    } catch { toast.error(t("common.error")); }
    finally { setUnlinkLoading(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) {
      toast.error(t("settings.passwordsMismatch"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("settings.passwordTooShort"));
      return;
    }
    setPasswordLoading(true);
    try {
      await apiClient("/api/users/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success(t("settings.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLanguageChange = (newLocale: string) => {
    setLocale(newLocale as Locale);
    toast.success(t("settings.languageUpdated"));
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
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-text-muted mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Appearance & Language */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-text-primary">{t("settings.appearance")}</h3>
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.appearanceDesc")}</Label>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("dark")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                theme === "dark"
                  ? "bg-brand/10 text-brand border border-brand/20"
                  : "bg-surface-raised/50 text-text-secondary border border-border-subtle hover:border-border-default"
              }`}
            >
              <Moon className="h-4 w-4" />
              {t("settings.themeDark")}
            </button>
            <button
              onClick={() => setTheme("light")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                theme === "light"
                  ? "bg-brand/10 text-brand border border-brand/20"
                  : "bg-surface-raised/50 text-text-secondary border border-border-subtle hover:border-border-default"
              }`}
            >
              <Sun className="h-4 w-4" />
              {t("settings.themeLight")}
            </button>
          </div>
        </div>
        <div className="h-px bg-border-subtle" />
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider flex items-center gap-2">
            <Globe className="h-3.5 w-3.5" />
            {t("settings.language")}
          </Label>
          <Select value={locale} onValueChange={handleLanguageChange}>
            <SelectTrigger className="w-52 bg-surface-raised/50 border-border-subtle h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-overlay border-border-subtle">
              <SelectItem value="es">{t("settings.languageES")}</SelectItem>
              <SelectItem value="en">{t("settings.languageEN")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Profile */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-text-primary">{t("settings.profile")}</h3>
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.nameLabel")}</Label>
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
          <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.emailLabel")}</Label>
          <Input value={profile.email} disabled
            className="bg-surface-raised/30 border-border-subtle h-10 rounded-xl text-text-muted" />
        </div>
      </div>

      {/* Change Password */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand/10 rounded-xl">
            <Lock className="h-4 w-4 text-brand" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t("settings.changePassword")}</h3>
            <p className="text-xs text-text-muted">{t("settings.changePasswordDesc")}</p>
          </div>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.currentPassword")}</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder={t("settings.currentPasswordPlaceholder")}
              className="bg-surface-raised/50 border-border-subtle h-10 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.newPassword")}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder={t("settings.newPasswordPlaceholder")}
              className="bg-surface-raised/50 border-border-subtle h-10 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.confirmNewPassword")}</Label>
            <Input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder={t("settings.confirmNewPasswordPlaceholder")}
              className="bg-surface-raised/50 border-border-subtle h-10 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            disabled={passwordLoading}
            className="bg-brand hover:bg-brand-dark text-white font-semibold h-10 px-6 rounded-xl"
          >
            {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
            {t("settings.changePasswordBtn")}
          </Button>
        </form>
      </div>

      {/* API Token */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{t("settings.apiToken")}</h3>
          <p className="text-xs text-text-muted mt-1">{t("settings.apiTokenDesc")}</p>
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
          <h3 className="text-sm font-semibold text-text-primary">{t("settings.telegram")}</h3>
        </div>
        {profile.telegramChatId ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center">
                <Check className="h-3 w-3 text-brand" />
              </div>
              <span className="text-sm text-brand font-medium">{t("settings.telegramLinked")}</span>
              <span className="text-xs text-text-muted">(Chat ID: {profile.telegramChatId})</span>
            </div>
            <Button onClick={handleUnlinkTelegram} variant="outline" size="sm" disabled={unlinkLoading}
              className="border-red-500/20 text-red-400 hover:bg-red-500/10">
              {unlinkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlink className="h-4 w-4 mr-2" />}
              {t("settings.unlink")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{t("settings.telegramDesc")}</p>
            <div className="p-4 rounded-xl bg-surface-raised/50 border border-border-subtle space-y-3">
              <ol className="text-sm text-text-muted space-y-2 list-decimal list-inside">
                <li>{t("settings.telegramStep1")}</li>
                <li>{t("settings.telegramStep2")} <span className="font-mono text-brand">/start</span></li>
                <li>{t("settings.telegramStep3")}</li>
              </ol>
            </div>
            {linkCode ? (
              <div className="flex items-center gap-3">
                <div className="px-5 py-3 rounded-xl bg-surface-raised border border-brand/20">
                  <span className="font-mono text-2xl font-bold tracking-[0.3em] text-brand">{linkCode}</span>
                </div>
                <span className="text-xs text-text-muted">{t("settings.expiresIn")}</span>
              </div>
            ) : (
              <Button onClick={handleGenerateLinkCode} disabled={linkCodeLoading}
                className="bg-brand hover:bg-brand-light text-black font-semibold">
                {linkCodeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                {t("settings.generateCode")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Preferences */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-text-primary">{t("settings.preferences")}</h3>
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.defaultCurrency")}</Label>
          <Select value={profile.defaultCurrency} onValueChange={handleCurrencyChange}>
            <SelectTrigger className="w-52 bg-surface-raised/50 border-border-subtle h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-surface-overlay border-border-subtle">
              <SelectItem value="COP">{t("settings.currencyCOP")}</SelectItem>
              <SelectItem value="USD">{t("settings.currencyUSD")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-px bg-border-subtle" />
        <div className="space-y-2">
          <Label className="text-text-secondary text-xs uppercase tracking-wider">{t("settings.timezone")}</Label>
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

      {/* Push Notifications */}
      {pushSupported && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand/10 rounded-xl">
              {pushEnabled ? <Bell className="h-4 w-4 text-brand" /> : <BellOff className="h-4 w-4 text-text-muted" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t("settings.pushNotifications")}</h3>
              <p className="text-xs text-text-muted">{t("settings.pushDesc")}</p>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised/50">
            <div>
              <p className="text-sm font-medium text-text-primary">
                {pushEnabled ? t("settings.pushEnabled") : t("settings.pushDisabled")}
              </p>
              <p className="text-xs text-text-muted">
                {pushEnabled ? t("settings.pushEnabledDesc") : t("settings.pushDisabledDesc")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTogglePush}
              disabled={pushLoading}
              className={pushEnabled
                ? "border-red-500/20 text-red-400 hover:bg-red-500/10"
                : "border-brand/20 text-brand hover:bg-brand/10"}
            >
              {pushLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : pushEnabled ? t("settings.deactivate") : t("settings.activate")}
            </Button>
          </div>
        </div>
      )}

      {/* Webhooks */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-accent/10 rounded-xl">
            <Webhook className="h-4 w-4 text-amber-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t("settings.webhooks")}</h3>
            <p className="text-xs text-text-muted">{t("settings.webhooksDesc")}</p>
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
            <Input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} placeholder={t("settings.webhookName")} required
              className="bg-surface-raised/50 border-border-subtle h-9 rounded-xl text-sm" />
            <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://..." type="url" required
              className="bg-surface-raised/50 border-border-subtle h-9 rounded-xl text-sm font-mono" />
          </div>
          <div className="flex gap-2">
            <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={t("settings.webhookSecret")}
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
          <h3 className="text-sm font-semibold text-text-primary">{t("settings.shortcutTitle")}</h3>
        </div>
        <p className="text-sm text-text-secondary">
          {t("settings.shortcutDesc")}
        </p>
        <div className="p-4 rounded-xl bg-surface-raised/50 border border-border-subtle">
          <ol className="text-sm text-text-muted space-y-2.5 list-decimal list-inside">
            <li>{t("settings.shortcutStep1")}</li>
            <li>{t("settings.shortcutStep2")}</li>
            <li>{t("settings.shortcutStep3")}</li>
            <li>{t("settings.shortcutStep4")}</li>
            <li>
              <strong className="text-amber-accent">{t("settings.shortcutStep5Important")}</strong>{" "}
              {t("settings.shortcutStep5")}
            </li>
            <li>{t("settings.shortcutStep6")}</li>
            <li>{t("settings.shortcutStep7")}
              <ul className="ml-4 mt-2 space-y-1.5">
                <li>URL: <code className="bg-surface-overlay px-2 py-0.5 rounded-md text-xs font-mono text-brand">{typeof window !== "undefined" ? window.location.origin : ""}/api/expenses/shortcut</code></li>
                <li>{t("settings.shortcutMethod")} <strong className="text-text-secondary">POST</strong></li>
                <li>Headers: <code className="bg-surface-overlay px-2 py-0.5 rounded-md text-xs font-mono text-text-muted">Authorization: Bearer {maskedToken}</code></li>
                <li>{t("settings.shortcutBody")}
                  <code className="bg-surface-overlay px-2 py-0.5 rounded-md text-xs font-mono text-text-muted block mt-1">{`{ "merchant": [Comercio], "amount": [Cantidad], "currency": [Codigo de moneda] }`}</code>
                  <span className="text-xs text-text-muted block mt-1">{t("settings.shortcutBodyHint")}</span>
                </li>
              </ul>
            </li>
          </ol>
        </div>
        <div className="p-3 rounded-xl bg-amber-accent/5 border border-amber-accent/20">
          <p className="text-xs text-amber-accent">
            {t("settings.shortcutTroubleshoot")}
          </p>
        </div>
      </div>
    </div>
  );
}
