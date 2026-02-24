"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { setTokens, setUser } from "@/lib/api-client";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Error al iniciar sesion");
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      toast.success("Bienvenido de vuelta!");
      router.push(inviteToken ? `/invite/${inviteToken}` : "/dashboard");
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
          <span className="text-2xl">💰</span>
        </div>
        <h1 className="text-2xl font-bold text-gradient tracking-tight">
          Mis Gastos
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Inicia sesion en tu cuenta
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
        <div className="space-y-2">
          <Label htmlFor="password" className="text-text-secondary text-xs uppercase tracking-wider font-medium">
            Contrasena
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Tu contrasena"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            <>
              Iniciar Sesion
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-border-subtle">
        <p className="text-center text-sm text-text-muted">
          No tienes cuenta?{" "}
          <Link href={inviteToken ? `/register?invite=${inviteToken}` : "/register"} className="text-brand hover:text-brand-light transition-colors font-medium">
            Registrate
          </Link>
        </p>
      </div>
    </div>
  );
}
