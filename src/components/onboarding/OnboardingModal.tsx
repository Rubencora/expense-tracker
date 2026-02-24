"use client";

import { useState, useEffect } from "react";
import { apiClient, getUser, setUser } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Rocket, Tags, MessageCircle, Smartphone, PartyPopper } from "lucide-react";

interface Category {
  id: string;
  name: string;
  emoji: string;
}

const STEPS = [
  { icon: Rocket, title: "Bienvenido a Mis Gastos!" },
  { icon: Tags, title: "Tus categorias" },
  { icon: MessageCircle, title: "Conecta Telegram" },
  { icon: Smartphone, title: "Configura Apple Pay" },
  { icon: PartyPopper, title: "Listo!" },
];

export default function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const user = getUser();
    if (user && user.onboardingCompleted === false) {
      setOpen(true);
      apiClient<Category[]>("/api/categories").then(setCategories);
    }
  }, []);

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleFinish = async () => {
    try {
      await apiClient("/api/users/me", { method: "PATCH", body: JSON.stringify({ onboardingCompleted: true }) });
      const user = getUser();
      if (user) setUser({ ...user, onboardingCompleted: true });
      setOpen(false);
      toast.success("Configuracion completada!");
    } catch { toast.error("Error al completar el onboarding"); }
  };

  const handleSkip = async () => { await handleFinish(); };

  const StepIcon = STEPS[step].icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-card border-border-subtle max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-brand/10 rounded-2xl glow-brand-sm">
              <StepIcon className="h-8 w-8 text-brand" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl text-text-primary">
            {STEPS[step].title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {step === 0 && (
            <div className="text-center text-sm text-text-secondary space-y-2">
              <p>Registra tus gastos de forma facil desde la web, Telegram o automaticamente con Apple Pay.</p>
              <p>La IA clasifica automaticamente tus gastos y puedes compartir espacios con otras personas.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary text-center mb-3">Estas son tus categorias. Puedes editarlas despues.</p>
              <div className="grid grid-cols-3 gap-2">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-surface-raised/50 border border-border-subtle text-sm">
                    <span>{cat.emoji}</span>
                    <span className="truncate text-text-secondary">{cat.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center text-sm text-text-secondary space-y-2">
              <p>Conecta tu cuenta de Telegram para registrar gastos con mensajes de texto, notas de voz o fotos de recibos.</p>
              <p className="font-medium text-text-primary">Busca el bot en Telegram, envia /start y sigue las instrucciones.</p>
            </div>
          )}

          {step === 3 && (
            <div className="text-center text-sm text-text-secondary space-y-2">
              <p>Configura una automatizacion en iOS Shortcuts para que cada compra con Apple Pay se registre automaticamente.</p>
              <p>Ve a Configuracion en la app para ver la guia completa.</p>
            </div>
          )}

          {step === 4 && (
            <div className="text-center text-sm text-text-secondary space-y-2">
              <p>Ya estas listo para empezar a registrar gastos.</p>
              <p>Puedes cambiar cualquier configuracion en cualquier momento.</p>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-4">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
              i === step ? "w-6 bg-brand" : "w-1.5 bg-surface-overlay"
            }`} />
          ))}
        </div>

        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-text-muted hover:text-text-secondary">
            Saltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} className="bg-brand hover:bg-brand-dark text-white">
              Siguiente
            </Button>
          ) : (
            <Button onClick={handleFinish} className="bg-brand hover:bg-brand-dark text-white">
              Empezar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
