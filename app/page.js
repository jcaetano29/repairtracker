"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/Badge";
import { StatCard } from "@/components/StatCard";
import { NuevoIngresoModal } from "@/components/NuevoIngresoModal";
import { DetalleOrdenModal } from "@/components/DetalleOrdenModal";
import { ESTADOS, getNivelRetraso, formatNumeroOrden } from "@/lib/constants";
import { getOrdenes, getStats, getTalleres } from "@/lib/data";

export default function DashboardPage() {
  const [ordenes, setOrdenes] = useState([]);
  const [stats, setStatsState] = useState({ activas: 0, conRetraso: 0, listasRetiro: 0, enTaller: 0 });
  const [talleres, setTalleresState] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroTaller, setFiltroTaller] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState("tabla");
  const [showNuevo, setShowNuevo] = useState(false);
  const [selectedOrden, setSelectedOrden] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [ordenesData, statsData, talleresData] = await Promise.all([
        getOrdenes({
          estado: filtroEstado,
          taller_id: filtroTaller,
          busqueda: busqueda || undefined,
        }),
        getStats(),
        getTalleres(),
      ]);
      setOrdenes(ordenesData);
      setStatsState(statsData);
      setTalleresState(talleresData);
    } catch (e) {
      console.error("Error cargando datos:", e);
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, filtroTaller, busqueda]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh cada 30 segundos
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Debounce búsqueda
  const [searchTimeout, setSearchTimeout] = useState(null);
  function handleSearch(value) {
    setBusqueda(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => loadData(), 400));
  }

  const estadosActivos = Object.entries(ESTADOS).filter(([k]) => k !== "ENTREGADO");

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⌚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-[11px] text-slate-400">Gestión de Reparaciones</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNuevo(true)}
              className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              + Nuevo Ingreso
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-5">
          <StatCard label="Activas" value={stats.activas} icon="📋" color="#0f172a" />
          <StatCard label="Con Retraso" value={stats.conRetraso} icon="⚠️" color="#ef4444" />
          <StatCard label="Para Retiro" value={stats.listasRetiro} icon="🎉" color="#22c55e" />
          <StatCard label="En Talleres" value={stats.enTaller} icon="🔧" color="#8b5cf6" />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="🔍 Buscar cliente, orden, marca..."
            value={busqueda}
            onChange={(e) => handleSearch(e.target.value)}
            className="px-3.5 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 w-64"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer"
          >
            <option value="TODOS">Todos los estados</option>
            {Object.entries(ESTADOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </select>
          <select
            value={filtroTaller}
            onChange={(e) => setFiltroTaller(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer"
          >
            <option value="TODOS">Todos los talleres</option>
            <option value="LOCAL">En el local</option>
            {talleres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setVista("tabla")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                vista === "tabla"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              ☰ Tabla
            </button>
            <button
              onClick={() => setVista("kanban")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                vista === "kanban"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              ▥ Kanban
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-slate-400">Cargando...</div>
        )}

        {/* Vista Tabla */}
        {!loading && vista === "tabla" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {["Orden", "Cliente", "Artículo", "Estado", "Taller", "Monto", "Días", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => {
                  const retraso = getNivelRetraso(o.estado, o.dias_en_estado);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrden(o)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors ${
                        retraso === "grave"
                          ? "bg-red-50 hover:bg-red-100/70"
                          : retraso === "leve"
                          ? "bg-amber-50 hover:bg-amber-100/50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-3 font-bold font-mono text-slate-900">
                        #{formatNumeroOrden(o.numero_orden)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{o.cliente_nombre}</div>
                        <div className="text-[11px] text-slate-400">{o.cliente_telefono}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{o.tipo_articulo}</div>
                        <div className="text-[11px] text-slate-400">{o.marca || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge estado={o.estado} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{o.taller_nombre || "—"}</td>
                      <td className="px-4 py-3 font-semibold font-mono text-sm">
                        {o.monto_presupuesto ? `$${Number(o.monto_presupuesto).toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          {retraso === "grave" && <span>🔴</span>}
                          {retraso === "leve" && <span>⚠️</span>}
                          <span
                            className={`text-xs font-semibold ${
                              retraso === "grave"
                                ? "text-red-600"
                                : retraso === "leve"
                                ? "text-amber-600"
                                : "text-slate-400"
                            }`}
                          >
                            {o.dias_en_estado}d
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ordenes.length === 0 && (
              <div className="py-16 text-center text-slate-400 text-sm">
                No se encontraron órdenes con estos filtros
              </div>
            )}
          </div>
        )}

        {/* Vista Kanban */}
        {!loading && vista === "kanban" && (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {estadosActivos.map(([estado, config]) => {
              const enEstado = ordenes.filter((o) => o.estado === estado);
              if (
                enEstado.length === 0 &&
                !["INGRESADO", "EN_REPARACION", "LISTO_PARA_RETIRO"].includes(estado)
              )
                return null;
              return (
                <div
                  key={estado}
                  className="flex-shrink-0 w-64 bg-white rounded-xl border border-slate-200 flex flex-col max-h-[70vh]"
                >
                  <div
                    className="px-3.5 py-3 flex items-center gap-2 border-b-2"
                    style={{ borderBottomColor: config.color }}
                  >
                    <span>{config.icon}</span>
                    <span className="text-xs font-bold text-slate-900 truncate">{config.label}</span>
                    <span
                      className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: config.bg, color: config.color }}
                    >
                      {enEstado.length}
                    </span>
                  </div>
                  <div className="p-2 space-y-1.5 overflow-y-auto flex-1">
                    {enEstado.map((o) => {
                      const retraso = getNivelRetraso(o.estado, o.dias_en_estado);
                      return (
                        <div
                          key={o.id}
                          onClick={() => setSelectedOrden(o)}
                          className={`p-2.5 rounded-lg cursor-pointer transition-colors ${
                            retraso === "grave"
                              ? "border-2 border-red-300 bg-red-50"
                              : retraso === "leve"
                              ? "border-2 border-amber-300 bg-amber-50"
                              : "border border-slate-200 bg-slate-50 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold font-mono text-slate-900">
                              #{formatNumeroOrden(o.numero_orden)}
                            </span>
                            <span className="text-[10px] text-slate-400">{o.dias_en_estado}d</span>
                          </div>
                          <div className="text-xs font-semibold text-slate-700">{o.cliente_nombre}</div>
                          <div className="text-[11px] text-slate-500">
                            {o.tipo_articulo} — {o.marca || "S/M"}
                          </div>
                          {o.taller_nombre && (
                            <div className="text-[10px] text-purple-600 mt-1">
                              📍 {o.taller_nombre}
                            </div>
                          )}
                          {retraso !== "none" && (
                            <div className="text-[10px] mt-1">
                              {retraso === "grave" ? "🔴 Retraso grave" : "⚠️ Retraso"}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {enEstado.length === 0 && (
                      <div className="py-8 text-center text-[11px] text-slate-300">Sin órdenes</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      {showNuevo && (
        <NuevoIngresoModal
          onClose={() => setShowNuevo(false)}
          onCreated={() => loadData()}
        />
      )}
      {selectedOrden && (
        <DetalleOrdenModal
          orden={selectedOrden}
          onClose={() => setSelectedOrden(null)}
          onUpdated={() => loadData()}
        />
      )}
    </div>
  );
}
