"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react";

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordForm /></Suspense>;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="glass-card rounded-2xl p-8 glow-brand-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h1 className="text-xl font-bold text-text-primary">Enlace invalido</h1>
        <p className="text-sm text-text-secondary mt-2">
          El enlace de recuperacion no es valido o ha expirado.
        </p>
        <Link
          href="/recuperar-contrasena"
          className="inline-flex items-center gap-2 mt-6 text-sm text-brand hover:text-brand-light transition-colors font-medium"
        >
          Solicitar nuevo enlace
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="glass-card rounded-2xl p-8 glow-brand-sm text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand/10 mb-4">
          <Check className="h-6 w-6 text-brand" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Contrasena actualizada
        </h1>
        <p className="text-sm text-text-secondary mt-3">
          Tu contrasena ha sido restablecida exitosamente.
        </p>
        <Button
          onClick={() => router.push("/login")}
          className="mt-6 bg-brand hover:bg-brand-dark text-white font-semibold rounded-xl h-11 px-8"
        >
          Iniciar sesion
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Las contrasenas no coinciden");
      return;
    }

    if (password.length < 6) {
      toast.error("La contrasena debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Error al restablecer la contrasena");
        return;
      }

      setSuccess(true);
    } catch {
      toast.error("Error de conexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-8 glow-brand-sm">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand/10 mb-4">
          <span className="text-2xl">🔐</span>
        </div>
        <h1 className="text-2xl font-bold text-gradient tracking-tight">
          Nueva contrasena
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Ingresa tu nueva contrasena
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-text-secondary text-xs uppercase tracking-wider font-medium">
            Nueva contrasena
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Minimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-surface-raised/50 border-border-subtle focus:border-brand/50 focus:ring-brand/20 h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-text-secondary text-xs uppercase tracking-wider font-medium">
            Confirmar contrasena
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Repite tu contrasena"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="bg-surface-raised/50 border-border-subtle focus:border-brand/50 focus:ring-brand/20 h-11 rounded-xl"
          />
        </div>
        <Button
          type="submit"
          className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Restablecer contrasena"
          )}
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-border-subtle">
        <p className="text-center text-sm text-text-muted">
          <Link href="/login" className="text-brand hover:text-brand-light transition-colors font-medium inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a iniciar sesion
          </Link>
        </p>
      </div>
    </div>
  );
}
