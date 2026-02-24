"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient, getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Loader2, CheckCircle2, XCircle, Users } from "lucide-react";

interface InviteInfo {
  spaceName: string;
  inviterName: string;
  email: string;
  status: string;
  valid: boolean;
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "info" | "accepting" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [spaceName, setSpaceName] = useState("");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);

  useEffect(() => {
    async function handleInvite() {
      // First, fetch invitation info (public, no auth)
      try {
        const res = await fetch(`/api/spaces/invite/info?token=${token}`);
        const info = await res.json();

        if (!res.ok) {
          setStatus("error");
          setMessage(info.error || "Invitacion no encontrada");
          return;
        }

        if (!info.valid) {
          setStatus("error");
          setMessage(
            info.status === "ACCEPTED"
              ? "Esta invitacion ya fue utilizada"
              : info.status === "EXPIRED"
                ? "Esta invitacion ha expirado"
                : "Invitacion no valida"
          );
          setSpaceName(info.spaceName);
          return;
        }

        setInviteInfo(info);
        setSpaceName(info.spaceName);

        // If user is logged in, accept automatically
        const accessToken = getAccessToken();
        if (accessToken) {
          setStatus("accepting");
          try {
            const data = await apiClient<{ success: boolean; message: string; space?: { id: string; name: string } }>("/api/spaces/invite/accept", {
              method: "POST",
              body: JSON.stringify({ token }),
            });
            setStatus("success");
            setMessage(data.message);
          } catch (err) {
            setStatus("error");
            setMessage(err instanceof Error ? err.message : "Error al aceptar la invitacion");
          }
        } else {
          // Not logged in - show info and login/register options
          setStatus("info");
        }
      } catch {
        setStatus("error");
        setMessage("Error de conexion");
      }
    }

    if (token) handleInvite();
  }, [token]);

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-card rounded-2xl p-8 text-center">

          {(status === "loading" || status === "accepting") && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-brand mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">
                {status === "accepting" ? "Aceptando invitacion..." : "Cargando..."}
              </h2>
              <p className="text-text-muted">Un momento por favor</p>
            </>
          )}

          {status === "info" && inviteInfo && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-5">
                <Users className="h-7 w-7 text-brand" />
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-2">
                Te invitaron a un espacio
              </h2>
              <p className="text-text-secondary mb-6">
                <strong className="text-text-primary">{inviteInfo.inviterName}</strong> te invito al espacio{" "}
                <strong className="text-brand">&quot;{inviteInfo.spaceName}&quot;</strong> para compartir gastos.
              </p>

              <div className="space-y-3">
                <Link href={`/register?invite=${token}`} className="block">
                  <Button className="w-full h-11 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold">
                    Crear cuenta y unirse
                  </Button>
                </Link>
                <Link href={`/login?invite=${token}`} className="block">
                  <Button variant="outline" className="w-full h-11 rounded-xl border-border-subtle text-text-secondary hover:bg-surface-overlay font-medium">
                    Ya tengo cuenta - Iniciar sesion
                  </Button>
                </Link>
              </div>

              <p className="text-xs text-text-muted mt-5">
                La invitacion se aceptara automaticamente al iniciar sesion.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 text-brand mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">{message}</h2>
              {spaceName && (
                <p className="text-text-muted mb-6">
                  Ahora puedes ver y compartir gastos en &quot;{spaceName}&quot;
                </p>
              )}
              <Button
                onClick={() => router.push("/espacios")}
                className="bg-brand hover:bg-brand-dark text-white"
              >
                Ir a Espacios
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-red-accent mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">No se pudo aceptar</h2>
              <p className="text-text-muted mb-6">{message}</p>
              <Link href="/login">
                <Button variant="outline" className="border-border-subtle text-text-secondary">
                  Ir a Iniciar sesion
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
