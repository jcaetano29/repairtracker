"use client";

import { useState, useEffect, useCallback } from "react";
import { formatNumeroOrden, formatFechaHora } from "@/lib/constants";

export function TrasladosPanel({ sucursalId, isDueno }) {
  const [traslados, setTraslados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);

  const loadTraslados = useCallback(async () => {
    try {
      const url = sucursalId
        ? `/api/traslados?sucursal_id=${sucursalId}`
        : "/api/traslados";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error cargando traslados");
      const data = await res.json();
      setTraslados(data.traslados || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    loadTraslados();
  }, [loadTraslados]);

  useEffect(() => {
    const interval = setInterval(loadTraslados, 30000);
    return () => clearInterval(interval);
  }, [loadTraslados]);

  async function handleAction(traslado_id, accion) {
    setActionLoading(traslado_id);
    setError(null);
    try {
      const res = await fetch("/api/traslados", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traslado_id, accion }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error");
      }
      await loadTraslados();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) return null;
  if (traslados.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🚚</span>
        <h3 className="text-sm font-bold text-slate-900">Traslados Activos</h3>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          {traslados.length}
        </span>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        {traslados.map((t) => {
          const orden = t.ordenes;
          const cliente = orden?.clientes;
          const tipoLabel = t.tipo === "ida" ? "Ida" : "Retorno";
          const estadoLabel = t.estado === "pendiente" ? "Pendiente despacho" : "En tránsito";
          const estadoColor = t.estado === "pendiente" ? "text-orange-600" : "text-blue-600";
          const estadoIcon = t.estado === "pendiente" ? "📦" : "🚚";

          return (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-slate-900">
                    #{formatNumeroOrden(orden?.numero_orden)}
                  </span>
                  <span className={`text-[10px] font-semibold ${estadoColor}`}>
                    {estadoIcon} {estadoLabel}
                  </span>
                  <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
                    {tipoLabel}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {cliente?.nombre} — {orden?.tipo_articulo} {orden?.marca ? `(${orden.marca})` : ""}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Creado: {formatFechaHora(t.created_at)}
                  {t.fecha_salida && ` | Despachado: ${formatFechaHora(t.fecha_salida)}`}
                </div>
              </div>

              <div className="flex-shrink-0">
                {t.estado === "pendiente" && (
                  <button
                    onClick={() => handleAction(t.id, "despachar")}
                    disabled={actionLoading === t.id}
                    className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 disabled:opacity-50"
                  >
                    {actionLoading === t.id ? "..." : "Despachar"}
                  </button>
                )}
                {t.estado === "en_transito" && (
                  <button
                    onClick={() => handleAction(t.id, "recibir")}
                    disabled={actionLoading === t.id}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 disabled:opacity-50"
                  >
                    {actionLoading === t.id ? "..." : "Recibir"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
