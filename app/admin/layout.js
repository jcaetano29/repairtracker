import Link from "next/link";

export default function AdminLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Admin header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <span className="text-2xl">⌚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-[11px] text-slate-400">Panel de administración</p>
            </div>
          </Link>
          <Link href="/" className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-2 mr-14">
            ← Volver al dashboard
          </Link>
        </div>
      </header>

      {/* Admin nav tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-1">
            {[
              { href: "/admin/configuracion", label: "⚙️ Configuración" },
              { href: "/admin/tipos-servicio", label: "⚙️ Tipos de servicio" },
              { href: "/admin/talleres", label: "🏪 Talleres" },
              { href: "/admin/marcas", label: "🏷️ Marcas" },
              { href: "/admin/usuarios", label: "👤 Usuarios" },
              { href: "/admin/sucursales", label: "🏢 Sucursales" },
              { href: "/admin/reportes", label: "📊 Reportes" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 border-b-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
