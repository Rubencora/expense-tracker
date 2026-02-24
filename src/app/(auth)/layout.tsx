export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mesh px-4 relative overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-brand/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />
      <div className="w-full max-w-md relative z-10 animate-fade-in">{children}</div>
    </div>
  );
}
