"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Users, Copy, Trash2 } from "lucide-react";

interface SpaceInfo {
  id: string;
  name: string;
  inviteCode: string;
  role: string;
  memberCount: number;
  expenseCount: number;
  createdAt: string;
}

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface UserProfile {
  id: string;
  defaultSpaceId: string | null;
}

export default function EspaciosPage() {
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [personalExpenseCount, setPersonalExpenseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [defaultSpaceId, setDefaultSpaceId] = useState<string | null>(null);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [membersDialog, setMembersDialog] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const fetchSpaces = useCallback(async () => {
    try {
      const result = await apiClient<{ spaces: SpaceInfo[]; personalExpenseCount: number }>("/api/spaces");
      setSpaces(result.spaces);
      setPersonalExpenseCount(result.personalExpenseCount);
      const profile = await apiClient<UserProfile>("/api/users/me");
      setDefaultSpaceId(profile.defaultSpaceId);
    } catch (err) {
      console.error("Error fetching spaces:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSpaces(); }, [fetchSpaces]);

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient("/api/spaces", { method: "POST", body: JSON.stringify({ name: newSpaceName }) });
      toast.success("Espacio creado");
      setNewSpaceName("");
      fetchSpaces();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el espacio");
    }
  };

  const handleJoinSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await apiClient<{ message: string }>("/api/spaces/join", { method: "POST", body: JSON.stringify({ inviteCode }) });
      toast.success(result.message);
      setInviteCode("");
      fetchSpaces();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al unirse");
    }
  };

  const handleSetDefault = async (spaceId: string | null) => {
    try {
      await apiClient("/api/users/me", { method: "PATCH", body: JSON.stringify({ defaultSpaceId: spaceId }) });
      setDefaultSpaceId(spaceId);
      toast.success("Espacio por defecto actualizado");
    } catch { toast.error("Error al cambiar espacio por defecto"); }
  };

  const openMembers = async (spaceId: string) => {
    setMembersDialog(spaceId);
    setLoadingMembers(true);
    try {
      const result = await apiClient<Member[]>(`/api/spaces/${spaceId}/members`);
      setMembers(result);
    } catch { toast.error("Error al cargar los miembros"); } finally { setLoadingMembers(false); }
  };

  const handleRemoveMember = async (spaceId: string, memberId: string) => {
    try {
      await apiClient(`/api/spaces/${spaceId}/members/${memberId}`, { method: "DELETE" });
      toast.success("Miembro removido");
      openMembers(spaceId);
      fetchSpaces();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al remover");
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Codigo copiado al portapapeles");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40 bg-surface-raised" />
        {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-24 rounded-2xl bg-surface-raised" />))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Espacios</h1>
        <p className="text-sm text-text-muted mt-1">Organiza tus gastos en espacios personales o compartidos.</p>
      </div>

      {/* Default Space */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Espacio por defecto</h3>
        <p className="text-xs text-text-muted mb-4">Los gastos desde Shortcut y Telegram se registran aqui</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={defaultSpaceId === null ? "default" : "outline"}
            size="sm"
            onClick={() => handleSetDefault(null)}
            className={defaultSpaceId === null ? "bg-brand hover:bg-brand-dark text-white" : "border-border-subtle text-text-secondary hover:bg-surface-overlay"}
          >
            Personal
          </Button>
          {spaces.map((s) => (
            <Button
              key={s.id}
              variant={defaultSpaceId === s.id ? "default" : "outline"}
              size="sm"
              onClick={() => handleSetDefault(s.id)}
              className={defaultSpaceId === s.id ? "bg-brand hover:bg-brand-dark text-white" : "border-border-subtle text-text-secondary hover:bg-surface-overlay"}
            >
              {s.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Spaces List */}
      <div className="space-y-2 stagger-children">
        <div className="glass-card glass-card-hover rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand/10 rounded-xl">
                <Users className="h-4 w-4 text-brand" />
              </div>
              <div>
                <p className="font-medium text-text-primary">Personal</p>
                <p className="text-xs text-text-muted">1 miembro · {personalExpenseCount} gastos</p>
              </div>
            </div>
            <Badge className="bg-brand/10 text-brand border-brand/20">Owner</Badge>
          </div>
        </div>

        {spaces.map((space) => (
          <div key={space.id} className="glass-card glass-card-hover rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-400/10 rounded-xl">
                  <Users className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">{space.name}</p>
                  <p className="text-xs text-text-muted">{space.memberCount} miembros · {space.expenseCount} gastos</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`text-[10px] ${space.role === "OWNER" ? "bg-brand/10 text-brand border-brand/20" : "bg-surface-overlay text-text-muted border-border-subtle"}`}>
                  {space.role === "OWNER" ? "Owner" : "Member"}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => copyInviteCode(space.inviteCode)} title="Copiar codigo"
                  className="text-text-muted hover:text-text-secondary">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openMembers(space.id)}
                  className="text-text-muted hover:text-text-secondary text-xs">
                  Miembros
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create & Join */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Crear espacio compartido</h3>
          <form onSubmit={handleCreateSpace} className="flex gap-2">
            <Input value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value)} placeholder="Nombre del espacio" required
              className="bg-surface-raised/50 border-border-subtle h-10 rounded-xl" />
            <Button type="submit" className="bg-brand hover:bg-brand-dark text-white shrink-0">Crear</Button>
          </form>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Unirse a un espacio</h3>
          <form onSubmit={handleJoinSpace} className="flex gap-2">
            <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Codigo de invitacion" required
              className="bg-surface-raised/50 border-border-subtle h-10 rounded-xl font-mono" />
            <Button type="submit" variant="outline" className="border-border-subtle text-text-secondary hover:bg-surface-overlay shrink-0">Unirse</Button>
          </form>
        </div>
      </div>

      {/* Members Dialog */}
      <Dialog open={!!membersDialog} onOpenChange={(open) => { if (!open) setMembersDialog(null); }}>
        <DialogContent className="glass-card border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Miembros del espacio</DialogTitle>
          </DialogHeader>
          {loadingMembers ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (<Skeleton key={i} className="h-12 bg-surface-raised" />))}
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-raised/50">
                  <div>
                    <p className="font-medium text-text-primary text-sm">{m.name}</p>
                    <p className="text-xs text-text-muted">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`text-[10px] ${m.role === "OWNER" ? "bg-brand/10 text-brand" : "bg-surface-overlay text-text-muted"}`}>
                      {m.role}
                    </Badge>
                    {m.role !== "OWNER" && membersDialog && (
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(membersDialog, m.userId)}
                        className="text-red-accent hover:bg-red-accent/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
