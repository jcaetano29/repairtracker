"use client";

import { useState, useEffect } from "react";
import { getReportesStats } from "@/lib/data";

const ESTADOS_CONFIG = {
  INGRESADO:            { label: "Ingresado",            color: "#6366f1" },
  EN_TALLER:            { label: "En Taller",            color: "#8b5cf6" },
  ESPERANDO_APROBACION: { label: "Esp. Aprobación",      color: "#f97316" },
  RECHAZADO:            { label: "Rechazado",            color: "#ef4444" },
  EN_REPARACION:        { label: "En Reparación",        color: "#3b82f6" },
  LISTO_EN_TALLER:      { label: "Listo en Taller",      color: "#14b8a6" },
  LISTO_PARA_RETIRO:    { label: "Listo para Retiro",    color: "#22c55e" },
  ENTREGADO:            { label: "Entregado",            color: "#64748b" },
};

function StatBox({ label, value, sub, color = "#6366f1" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">{label}</div>
      <div className="text-3xl font-extrabold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function ReportesPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getReportesStats()
      .then(setStats)
      .catch(() => setError("Error cargando reportes"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Cargando reportes...</div>;
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>;
  if (!stats) return null;

  const topTipos = Object.entries(stats.porTipo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const estadosOrdenados = [
    "INGRESADO", "EN_TALLER", "ESPERANDO_APROBACION", "EN_REPARACION",
    "LISTO_EN_TALLER", "LISTO_PARA_RETIRO", "ENTREGADO", "RECHAZADO",
  ].filter(e => stats.porEstado[e]);

  const totalParaBarras = Math.max(...estadosOrdenados.map(e => stats.porEstado[e] || 0), 1);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">Reportes</h2>
        <p className="text-sm text-slate-500 mt-0.5">Resumen de actividad del negocio</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatBox
          label="Órdenes este mes"
          value={stats.ordenesEsteMes}
          sub={`${stats.totalOrdenes} históricas`}
          color="#6366f1"
        />
        <StatBox
          label="Entregadas este mes"
          value={stats.ordenesEntregadasEsteMes}
          color="#22c55e"
        />
        <StatBox
          label="Valor presupuestado"
          value={`$${Math.round(stats.ingresosMes).toLocaleString("es-UY")}`}
          sub="UYU — entregadas este mes"
          color="#f59e0b"
        />
        <StatBox
          label="Promedio resolución"
          value={stats.promedioDiasMes !== null ? `${stats.promedioDiasMes}d` : "—"}
          sub="días hasta listo (este mes)"
          color="#8b5cf6"
        />
      </div>

      {/* Second row: Revenue histórica + Ticket promedio */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatBox
          label="Ingresos históricos"
          value={`$${Math.round(stats.ingresosHistoricos).toLocaleString("es-UY")}`}
          sub="UYU — total facturado"
          color="#10b981"
        />
        <StatBox
          label="Ticket promedio"
          value={stats.ticketPromedio !== null ? `$${stats.ticketPromedio.toLocaleString("es-UY")}` : "—"}
          sub="UYU — por orden entregada"
          color="#6366f1"
        />
        <StatBox
          label="Órdenes con retraso"
          value={stats.ordenesConRetraso}
          sub="activas que superan el umbral"
          color={stats.ordenesConRetraso > 0 ? "#ef4444" : "#22c55e"}
        />
        <StatBox
          label="Presupuestos rechazados"
          value={stats.totalRechazadas}
          sub={stats.tasaRechazo !== null ? `${stats.tasaRechazo}% de tasa de rechazo` : "total histórico"}
          color={stats.tasaRechazo > 30 ? "#ef4444" : "#64748b"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Orders by state */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">
            Órdenes por estado
          </div>
          <div className="space-y-2">
            {estadosOrdenados.map(estado => {
              const count = stats.porEstado[estado] || 0;
              const cfg = ESTADOS_CONFIG[estado] || { label: estado, color: "#94a3b8" };
              return (
                <div key={estado} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700">{cfg.label}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(count / totalParaBarras) * 100}%`,
                          backgroundColor: cfg.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {estadosOrdenados.length === 0 && (
              <div className="text-sm text-slate-400">Sin datos aún</div>
            )}
          </div>
        </div>

        {/* Top article types */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">
            Artículos más frecuentes
          </div>
          <div className="space-y-2">
            {topTipos.map(([tipo, count]) => (
              <div key={tipo} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{tipo}</span>
                    <span className="font-semibold text-slate-900">{count}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${stats.totalOrdenes > 0 ? (count / stats.totalOrdenes) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {topTipos.length === 0 && (
              <div className="text-sm text-slate-400">Sin datos aún</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Clients */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">Clientes</div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Total en la base</span>
              <span className="font-bold text-slate-900">{stats.clientesUnicos}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Nuevos este mes</span>
              <span className="font-bold text-indigo-600">{stats.clientesNuevosEsteMes}</span>
            </div>
          </div>
        </div>

        {/* Taller stats */}
        {stats.talleresStats.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4">
              Talleres externos
            </div>
            <div className="space-y-3">
              {stats.talleresStats.map(t => (
                <div key={t.id} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 truncate flex-1">{t.nombre}</span>
                  <div className="flex gap-4 text-xs text-slate-500 ml-3 shrink-0">
                    <span>
                      <span className="font-semibold text-slate-800">{t.ordenes_activas}</span> activas
                    </span>
                    <span>
                      <span className="font-semibold text-slate-800">{t.ordenes_completadas}</span> listas
                    </span>
                    {t.promedio_dias_reparacion !== null && (
                      <span>
                        <span className="font-semibold text-slate-800">{t.promedio_dias_reparacion}d</span> prom
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
