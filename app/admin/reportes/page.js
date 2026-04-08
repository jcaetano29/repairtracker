"use client";

import { useState, useEffect } from "react";
import { getReportesStats } from "@/lib/data";

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

  useEffect(() => {
    getReportesStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Cargando reportes...</div>;
  if (!stats) return null;

  const topTipos = Object.entries(stats.porTipo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

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
          label="Ingresos del mes"
          value={`$${Math.round(stats.ingresosMes).toLocaleString("es-UY")}`}
          sub="UYU (presupuestado)"
          color="#f59e0b"
        />
        <StatBox
          label="Promedio de resolución"
          value={`${stats.promedioDias}d`}
          sub="días hasta listo"
          color="#8b5cf6"
        />
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
                      style={{ width: `${(count / stats.totalOrdenes) * 100}%` }}
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
    </div>
  );
}
