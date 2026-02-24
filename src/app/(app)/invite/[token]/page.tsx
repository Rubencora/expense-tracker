"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [spaceName, setSpaceName] = useState("");

  useEffect(() => {
    async function acceptInvite() {
      try {
        const data = await apiClient<{ success: boolean; message: string; space?: { id: string; name: string } }>("/api/spaces/invite/accept", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        setStatus("success");
        setMessage(data.message);
        setSpaceName(data.space?.name || "");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Error al aceptar la invitacion");
      }
    }

    if (token) acceptInvite();
  }, [token]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto p-8">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Aceptando invitacion...</h2>
            <p className="text-slate-400">Un momento por favor</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">{message}</h2>
            {spaceName && (
              <p className="text-slate-400 mb-6">
                Ahora puedes ver y compartir gastos en &quot;{spaceName}&quot;
              </p>
            )}
            <Button
              onClick={() => router.push("/espacios")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Ir a Espacios
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">No se pudo aceptar</h2>
            <p className="text-slate-400 mb-6">{message}</p>
            <Button
              onClick={() => router.push("/espacios")}
              variant="outline"
              className="border-slate-700"
            >
              Ir a Espacios
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
