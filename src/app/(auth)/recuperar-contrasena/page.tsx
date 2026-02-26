"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al enviar el email");
        return;
      }

      setSent(true);
    } catch {
      toast.error("Error de conexion");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="glass-card rounded-2xl p-8 glow-brand-sm">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand/10 mb-4">
            <Mail className="h-6 w-6 text-brand" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Revisa tu email
          </h1>
          <p className="text-sm text-text-secondary mt-3 leading-relaxed">
            Si existe una cuenta con <strong className="text-text-primary">{email}</strong>, recibiras un enlace para restablecer tu contrasena.
          </p>
          <p className="text-xs text-text-muted mt-4">
            El enlace expira en 1 hora.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 mt-6 text-sm text-brand hover:text-brand-light transition-colors font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a iniciar sesion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-8 glow-brand-sm">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand/10 mb-4">
          <span className="text-2xl">🔑</span>
        </div>
        <h1 className="text-2xl font-bold text-gradient tracking-tight">
          Recuperar contrasena
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Ingresa tu email y te enviaremos un enlace
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-text-secondary text-xs uppercase tracking-wider font-medium">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
            "Enviar enlace de recuperacion"
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
