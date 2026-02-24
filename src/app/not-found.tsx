import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mesh px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-brand/5 blur-[120px] pointer-events-none" />
      <div className="text-center relative z-10 animate-fade-in">
        <h1 className="text-8xl font-bold text-gradient tracking-tighter">404</h1>
        <p className="text-xl text-text-secondary mt-4 font-medium">Pagina no encontrada</p>
        <Link
          href="/dashboard"
          className="inline-block mt-8 px-8 py-3 bg-brand hover:bg-brand-dark text-white rounded-xl font-semibold transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]"
        >
          Ir al Dashboard
        </Link>
      </div>
    </div>
  );
}
