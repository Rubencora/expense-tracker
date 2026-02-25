"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getAccessToken, getUser, clearTokens } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";
import {
  LayoutDashboard,
  Receipt,
  Tags,
  Users,
  Settings,
  LogOut,
  Banknote,
  Target,
  MessageSquare,
} from "lucide-react";
import OnboardingModal from "@/components/onboarding/OnboardingModal";

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/gastos", labelKey: "nav.expenses", icon: Receipt },
  { href: "/ingresos", labelKey: "nav.income", icon: Banknote },
  { href: "/metas", labelKey: "nav.goals", icon: Target },
  { href: "/chat", labelKey: "nav.chat", icon: MessageSquare },
  { href: "/categorias", labelKey: "nav.categories", icon: Tags },
  { href: "/espacios", labelKey: "nav.spaces", icon: Users },
  { href: "/configuracion", labelKey: "nav.settings", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const user = getUser();
    if (user) setUserName(user.name);
    setIsReady(true);
  }, [router]);

  const handleLogout = () => {
    clearTokens();
    router.replace("/login");
  };

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-mesh">
        <div className="relative">
          <div className="w-10 h-10 rounded-full border-2 border-brand/20 border-t-brand animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-[260px] md:flex-col md:fixed md:inset-y-0 border-r border-border-subtle bg-surface/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 h-16 px-6 border-b border-border-subtle">
          <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
            <span className="text-lg">💰</span>
          </div>
          <h1 className="text-lg font-bold text-gradient">{t("app.name")}</h1>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-brand/10 text-brand shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-overlay"
                }`}
              >
                <item.icon className={`h-[18px] w-[18px] transition-colors ${
                  isActive ? "text-brand" : "text-text-muted group-hover:text-text-secondary"
                }`} />
                {t(item.labelKey)}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-surface-overlay flex items-center justify-center text-xs font-semibold text-text-secondary shrink-0">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text-secondary truncate">{userName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-text-muted hover:text-red-accent hover:bg-red-accent/10 transition-all"
              title={t("auth.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-[260px] pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50">
        <div className="mx-3 mb-3 rounded-2xl glass-card border border-border-subtle overflow-hidden">
          <div className="flex justify-around py-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center py-2.5 px-3 text-[10px] font-medium transition-all relative ${
                    isActive ? "text-brand" : "text-text-muted"
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-brand" />
                  )}
                  <item.icon className={`h-5 w-5 mb-1 ${isActive ? "text-brand" : ""}`} />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <OnboardingModal />
    </div>
  );
}
