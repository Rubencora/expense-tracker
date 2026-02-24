"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Bot, User, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "\u00bfCuanto gaste este mes?",
  "\u00bfEn que gasto mas?",
  "\u00bfComo van mis metas?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await apiClient<{ reply: string }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          history: updatedMessages,
        }),
      });

      const assistantMessage: Message = {
        role: "assistant",
        content: response.reply,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al enviar el mensaje"
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] animate-fade-in">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand" />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Chat financiero
          </h1>
        </div>
        <p className="text-sm text-text-muted mt-1">
          Preguntale a la IA sobre tus finanzas
        </p>
      </div>

      {/* Chat area */}
      <div className="glass-card rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Messages container */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-brand" />
              </div>
              <p className="text-text-secondary text-lg font-medium mb-1">
                Hola, soy tu asistente financiero
              </p>
              <p className="text-text-muted text-sm mb-6 max-w-sm">
                Puedo responder preguntas sobre tus gastos, ingresos, metas de
                ahorro y mas. Prueba con alguna de estas sugerencias:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-brand bg-brand/10 hover:bg-brand/20 border border-brand/20 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 ${
                    message.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      message.role === "user"
                        ? "bg-brand text-white"
                        : "bg-surface-overlay text-brand"
                    }`}
                  >
                    {message.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-brand text-white"
                        : "glass-card bg-surface-raised/50"
                    }`}
                  >
                    <p
                      className={`text-sm leading-relaxed whitespace-pre-wrap ${
                        message.role === "user"
                          ? "text-white"
                          : "text-text-primary"
                      }`}
                    >
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-surface-overlay text-brand">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="glass-card bg-surface-raised/50 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      <span className="text-sm text-text-muted">
                        Pensando...
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-white/[0.06] p-4 bg-surface-overlay/50">
          <form onSubmit={handleSubmit} className="flex items-center gap-3">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta..."
              disabled={loading}
              className="flex-1 bg-surface-raised/50 border-border-subtle h-11 rounded-xl text-text-primary placeholder:text-text-muted"
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              className="h-11 w-11 rounded-xl bg-brand hover:bg-brand-dark text-white shrink-0 disabled:opacity-40"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
