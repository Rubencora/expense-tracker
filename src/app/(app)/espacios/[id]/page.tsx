"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient, getUser } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Loader2, Receipt, Banknote, CheckCircle } from "lucide-react";

interface BalanceItem {
  from: { id: string; name: string };
  to: { id: string; name: string };
  amount: number;
}

interface UserSummary {
  id: string;
  name: string;
  netBalance: number;
}

interface ActivityItem {
  type: "expense" | "settlement";
  id: string;
  date: string;
  // expense fields
  user?: { id: string; name: string };
  merchant?: string;
  amount?: number;
  currency?: string;
  amountUsd?: number;
  category?: { name: string; emoji: string };
  splitType?: string | null;
  splitCount?: number;
  // settlement fields
  fromUser?: { id: string; name: string };
  toUser?: { id: string; name: string };
  note?: string | null;
}

interface SettlementRecord {
  id: string;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
  amountUsd: number;
  note: string | null;
  createdAt: string;
}

export default function SpaceDetailPage() {
  const params = useParams();
  const spaceId = params.id as string;
  const currentUser = getUser();

  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [userSummary, setUserSummary] = useState<UserSummary[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("balances");

  // Settlement dialog
  const [settleDialog, setSettleDialog] = useState<{ toUserId: string; toName: string; suggested: number } | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settleLoading, setSettleLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, actRes, setRes] = await Promise.all([
        apiClient<{ balances: BalanceItem[]; userSummary: UserSummary[] }>(`/api/spaces/${spaceId}/balances`),
        apiClient<{ activity: ActivityItem[] }>(`/api/spaces/${spaceId}/activity?limit=50`),
        apiClient<{ settlements: SettlementRecord[] }>(`/api/spaces/${spaceId}/settlements`),
      ]);
      setBalances(balRes.balances);
      setUserSummary(balRes.userSummary);
      setActivity(actRes.activity);
      setSettlements(setRes.settlements);
    } catch (err) {
      console.error("Error fetching space data:", err);
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const myBalance = userSummary.find((u) => u.id === currentUser?.id);

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleDialog) return;
    setSettleLoading(true);
    try {
      await apiClient(`/api/spaces/${spaceId}/settlements`, {
        method: "POST",
        body: JSON.stringify({
          toUserId: settleDialog.toUserId,
          amountUsd: parseFloat(settleAmount),
          note: settleNote || null,
        }),
      });
      toast.success("Pago registrado");
      setSettleDialog(null);
      setSettleAmount("");
      setSettleNote("");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar pago");
    } finally {
      setSettleLoading(false);
    }
  };

  const openSettleDialog = (toUserId: string, toName: string, amount: number) => {
    setSettleDialog({ toUserId, toName, suggested: amount });
    setSettleAmount(amount.toFixed(2));
    setSettleNote("");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-surface-raised" />
        <Skeleton className="h-32 rounded-2xl bg-surface-raised" />
        <Skeleton className="h-64 rounded-2xl bg-surface-raised" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <button onClick={() => window.history.back()} className="text-sm text-text-muted hover:text-text-secondary mb-2 flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Espacios
        </button>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Detalle del espacio</h1>
      </div>

      {/* My Balance Summary */}
      {myBalance && (
        <div className={`glass-card rounded-2xl p-6 border-l-4 ${
          myBalance.netBalance > 0.01
            ? "border-l-brand"
            : myBalance.netBalance < -0.01
            ? "border-l-red-accent"
            : "border-l-zinc-500"
        }`}>
          <p className="text-sm text-text-muted mb-1">Tu balance</p>
          {myBalance.netBalance > 0.01 ? (
            <p className="text-2xl font-bold font-numbers text-brand">
              Te deben ${myBalance.netBalance.toFixed(2)} USD
            </p>
          ) : myBalance.netBalance < -0.01 ? (
            <p className="text-2xl font-bold font-numbers text-red-accent">
              Debes ${Math.abs(myBalance.netBalance).toFixed(2)} USD
            </p>
          ) : (
            <p className="text-2xl font-bold text-text-muted flex items-center gap-2">
              <CheckCircle className="h-5 w-5" /> Estas al dia
            </p>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-surface-raised border border-border-subtle">
          <TabsTrigger value="balances" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">Balances</TabsTrigger>
          <TabsTrigger value="activity" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">Actividad</TabsTrigger>
          <TabsTrigger value="settlements" className="data-[state=active]:bg-brand/10 data-[state=active]:text-brand">Pagos</TabsTrigger>
        </TabsList>

        {/* Balances Tab */}
        <TabsContent value="balances" className="mt-4 space-y-3">
          {balances.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <CheckCircle className="h-8 w-8 text-brand mx-auto mb-3" />
              <p className="text-text-secondary font-medium">Todas las cuentas estan saldadas</p>
              <p className="text-xs text-text-muted mt-1">No hay deudas pendientes</p>
            </div>
          ) : (
            balances.map((b, i) => {
              const isMyDebt = b.from.id === currentUser?.id;
              const isOwedToMe = b.to.id === currentUser?.id;
              return (
                <div key={i} className="glass-card glass-card-hover rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-surface-overlay flex items-center justify-center text-xs font-semibold text-text-secondary">
                          {b.from.name.charAt(0).toUpperCase()}
                        </div>
                        <ArrowRight className={`h-4 w-4 ${isMyDebt ? "text-red-accent" : "text-text-muted"}`} />
                        <div className="w-8 h-8 rounded-full bg-surface-overlay flex items-center justify-center text-xs font-semibold text-text-secondary">
                          {b.to.name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {isMyDebt ? "Tu" : b.from.name} <span className="text-text-muted">le debe a</span> {isOwedToMe ? "ti" : b.to.name}
                        </p>
                        <p className="text-lg font-bold font-numbers text-text-primary">
                          ${b.amount.toFixed(2)} <span className="text-xs font-normal text-text-muted">USD</span>
                        </p>
                      </div>
                    </div>
                    {isMyDebt && (
                      <Button
                        size="sm"
                        onClick={() => openSettleDialog(b.to.id, b.to.name, b.amount)}
                        className="bg-brand hover:bg-brand-dark text-white"
                      >
                        Pagar
                      </Button>
                    )}
                    {isOwedToMe && (
                      <span className="text-xs text-brand font-medium px-3 py-1.5 rounded-lg bg-brand/10">
                        Te deben
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* All members summary */}
          {userSummary.length > 0 && (
            <div className="glass-card rounded-2xl p-5 mt-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Resumen por miembro</h3>
              <div className="space-y-2">
                {userSummary.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-text-secondary">
                      {u.id === currentUser?.id ? "Tu" : u.name}
                    </span>
                    <span className={`text-sm font-bold font-numbers ${
                      u.netBalance > 0.01 ? "text-brand" : u.netBalance < -0.01 ? "text-red-accent" : "text-text-muted"
                    }`}>
                      {u.netBalance > 0.01 ? `+$${u.netBalance.toFixed(2)}` : u.netBalance < -0.01 ? `-$${Math.abs(u.netBalance).toFixed(2)}` : "$0.00"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-4 space-y-2">
          {activity.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-text-muted">No hay actividad en este espacio</p>
            </div>
          ) : (
            activity.map((item) => (
              <div key={`${item.type}-${item.id}`} className="glass-card rounded-xl p-4">
                {item.type === "expense" ? (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-400/10 shrink-0">
                      <Receipt className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">
                        <span className="font-medium">{item.user?.id === currentUser?.id ? "Tu" : item.user?.name}</span>
                        {" "}agrego: <span className="font-medium">{item.category?.emoji} {item.merchant}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm font-bold font-numbers text-text-primary">
                          ${item.amountUsd?.toFixed(2)} USD
                        </span>
                        {item.splitType && item.splitType !== "SOLO" && (
                          <span className="text-xs text-text-muted">
                            · dividido ({item.splitCount})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {new Date(item.date).toLocaleDateString("es-CO", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-brand/10 shrink-0">
                      <Banknote className="h-4 w-4 text-brand" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary">
                        <span className="font-medium">{item.fromUser?.id === currentUser?.id ? "Tu" : item.fromUser?.name}</span>
                        {" "}le pago a{" "}
                        <span className="font-medium">{item.toUser?.id === currentUser?.id ? "ti" : item.toUser?.name}</span>
                      </p>
                      <span className="text-sm font-bold font-numbers text-brand">
                        ${item.amountUsd?.toFixed(2)} USD
                      </span>
                      {item.note && (
                        <p className="text-xs text-text-muted italic mt-0.5">{item.note}</p>
                      )}
                      <p className="text-xs text-text-muted mt-0.5">
                        {new Date(item.date).toLocaleDateString("es-CO", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </TabsContent>

        {/* Settlements Tab */}
        <TabsContent value="settlements" className="mt-4 space-y-2">
          {settlements.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <p className="text-text-muted">No hay pagos registrados</p>
            </div>
          ) : (
            settlements.map((s) => (
              <div key={s.id} className="glass-card rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary">
                      <span className="font-medium">{s.fromUser.id === currentUser?.id ? "Tu" : s.fromUser.name}</span>
                      {" "}<ArrowRight className="inline h-3.5 w-3.5 text-text-muted" />{" "}
                      <span className="font-medium">{s.toUser.id === currentUser?.id ? "Ti" : s.toUser.name}</span>
                    </p>
                    {s.note && <p className="text-xs text-text-muted italic mt-0.5">{s.note}</p>}
                    <p className="text-xs text-text-muted mt-0.5">
                      {new Date(s.createdAt).toLocaleDateString("es-CO", {
                        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className="text-lg font-bold font-numbers text-brand">
                    ${s.amountUsd.toFixed(2)}
                  </p>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Settlement Dialog */}
      <Dialog open={!!settleDialog} onOpenChange={(open) => { if (!open) setSettleDialog(null); }}>
        <DialogContent className="glass-card border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">
              Pagarle a {settleDialog?.toName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSettle} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-text-secondary text-xs uppercase tracking-wider">Monto (USD)</Label>
              <Input
                type="number"
                step="any"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                required
                className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl font-numbers"
              />
              <p className="text-xs text-text-muted">Deuda total: ${settleDialog?.suggested.toFixed(2)} USD</p>
            </div>
            <div className="space-y-2">
              <Label className="text-text-secondary text-xs uppercase tracking-wider">Nota (opcional)</Label>
              <Input
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                placeholder="Ej: Nequi, Efectivo, Daviplata"
                className="bg-surface-raised/50 border-border-subtle h-11 rounded-xl"
              />
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold" disabled={settleLoading}>
              {settleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar pago"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
