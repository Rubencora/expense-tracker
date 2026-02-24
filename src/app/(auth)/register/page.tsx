"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { setTokens, setUser } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Error al crear la cuenta");
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      toast.success("Cuenta creada exitosamente!");
      router.push("/dashboard");
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
          <span className="text-2xl">✨</span>
        </div>
        <h1 className="text-2xl font-bold text-gradient tracking-tight">
          Mis Gastos
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Crea tu cuenta gratis
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-text-secondary text-xs uppercase tracking-wider font-medium">
            Nombre
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="bg-surface-raised/50 border-border-subtle focus:border-brand/50 focus:ring-brand/20 h-11 rounded-xl"
          />
        </div>
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
        <div className="space-y-2">
          <Label htmlFor="password" className="text-text-secondary text-xs uppercase tracking-wider font-medium">
            Contrasena
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
        <Button
          type="submit"
          className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Crear Cuenta
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-border-subtle">
        <p className="text-center text-sm text-text-muted">
          Ya tienes cuenta?{" "}
          <Link href="/login" className="text-brand hover:text-brand-light transition-colors font-medium">
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  );
}
