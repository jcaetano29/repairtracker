// app/seguimiento/[token]/page.js
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ESTADOS, formatFecha, formatNumeroOrden } from "@/lib/constants";
import { notFound } from "next/navigation";

export default async function SeguimientoPage({ params }) {
  const { token } = await params;

  const { data: orden, error } = await getSupabaseAdmin()
    .from("ordenes")
    .select("*, clientes(nombre), talleres(nombre)")
    .eq("tracking_token", token)
    .single();

  if (error || !orden) notFound();

  const estadoConfig = ESTADOS[orden.estado];

  // Build a simple timeline of key dates
  const timeline = [
    { label: "Ingresado", fecha: orden.fecha_ingreso, done: true },
    { label: "En proceso", fecha: orden.fecha_aprobacion || orden.fecha_envio_taller, done: !!orden.fecha_aprobacion || !!orden.fecha_envio_taller },
    { label: "Listo para retiro", fecha: orden.fecha_listo, done: !!orden.fecha_listo },
    { label: "Entregado", fecha: orden.fecha_entrega, done: !!orden.fecha_entrega },
  ];

  return (
    <div className="min-h-screen bg-slate-100 py-12 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-4xl">⌚</span>
          <h1 className="text-lg font-bold text-slate-900 mt-2">RepairTrack</h1>
          <p className="text-sm text-slate-500">Seguimiento de orden</p>
        </div>

        {/* Order card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Orden</div>
              <div className="text-3xl font-extrabold text-slate-900 font-mono">
                #{formatNumeroOrden(orden.numero_orden)}
              </div>
            </div>
            <div
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: estadoConfig.bg, color: estadoConfig.color }}
            >
              {estadoConfig.icon} {estadoConfig.label}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-slate-400 w-24 flex-shrink-0">Cliente</span>
              <span className="font-semibold text-slate-900">{orden.clientes?.nombre}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-24 flex-shrink-0">Artículo</span>
              <span className="text-slate-700">
                {orden.tipo_articulo}{orden.marca ? ` — ${orden.marca}` : ""}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-slate-400 w-24 flex-shrink-0">Ingreso</span>
              <span className="text-slate-700">{formatFecha(orden.fecha_ingreso)}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">Progreso</div>
          <div className="space-y-3">
            {timeline.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    step.done
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-100 text-slate-300"
                  }`}
                >
                  {step.done ? "✓" : "○"}
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${step.done ? "text-slate-900" : "text-slate-300"}`}>
                    {step.label}
                  </div>
                  {step.fecha && (
                    <div className="text-xs text-slate-400">{formatFecha(step.fecha)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
