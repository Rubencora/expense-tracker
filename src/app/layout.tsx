import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mis Gastos - Control de Gastos Personales",
  description: "App de registro de gastos personales con clasificacion IA, bot de Telegram y dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mis Gastos",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0D12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            style: {
              background: "rgba(20, 23, 32, 0.9)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#F1F3F7",
            },
          }}
        />
      </body>
    </html>
  );
}
