"use client";

import { useState, useEffect } from "react";
import { Badge } from "./Badge";
import { ESTADOS, TRANSICIONES, getNivelRetraso, formatFechaHora, formatNumeroOrden } from "@/lib/constants";
import { cambiarEstado, asignarTaller, registrarPresupuesto, entregarAlCliente, getHistorial, getTalleres } from "@/lib/data";

export function DetalleOrdenModal({ orden, onClose, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [talleres, setTalleresState] = useState([]);
  const [showAsignar, setShowAsignar] = useState(false);
  const [showPresupuesto, setShowPresupuesto] = useState(false);
  const [showEntrega, setShowEntrega] = useState(false);
  const [monto, setMonto] = useState("");
  const [tallerSelected, setTallerSelected] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [error, setError] = useState(null);

  const retraso = getNivelRetraso(orden.estado, orden.dias_en_estado);
  const siguientes = TRANSICIONES[orden.estado] || [];

  useEffect(() => {
    loadData();
  }, [orden.id]);

  async function loadData() {
    try {
      const [h, t] = await Promise.all([getHistorial(orden.id), getTalleres()]);
      setHistorial(h);
      setTalleresState(t);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCambiarEstado(nuevoEstado) {
    // Si va a taller, mostrar selector
    if (nuevoEstado === "EN_TALLER") {
      setShowAsignar(true);
      return;
    }
    // Si pasa a ESPERANDO_APROBACION, pedir monto
    if (nuevoEstado === "ESPERANDO_APROBACION" && !orden.monto_presupuesto) {
      setShowPresupuesto(true);
      return;
    }
    // Si pasa a ENTREGADO, pedir pago
    if (nuevoEstado === "ENTREGADO") {
      setShowEntrega(true);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await cambiarEstado(orden.id, nuevoEstado);
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAsignarTaller() {
    if (!tallerSelected) return;
    setLoading(true);
    try {
      await asignarTaller(orden.id, tallerSelected);
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePresupuesto() {
    if (!monto || parseFloat(monto) <= 0) return;
    setLoading(true);
    try {
      await registrarPresupuesto(orden.id, parseFloat(monto));
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEntrega() {
    setLoading(true);
    try {
      await entregarAlCliente(orden.id, monto ? parseFloat(monto) : orden.monto_presupuesto, metodoPago);
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-400 font-semibold tracking-wider">ORDEN</div>
              <h2 className="text-2xl font-extrabold text-slate-900">
                #{formatNumeroOrden(orden.numero_orden)}
              </h2>
            </div>
            <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Alerta de retraso */}
          {retraso !== "none" && (
            <div
              className={`p-3 rounded-lg text-sm border ${
                retraso === "grave"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}
            >
              {retraso === "grave" ? "🔴" : "⚠️"} {orden.dias_en_estado} días en este estado
              {retraso === "grave" ? " — Retraso grave" : " — Posible retraso"}
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Cliente</div>
              <div className="text-sm font-bold text-slate-900">{orden.cliente_nombre}</div>
              <div className="text-xs text-slate-500">{orden.cliente_telefono}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Artículo</div>
              <div className="text-sm font-bold text-slate-900">{orden.tipo_articulo}</div>
              <div className="text-xs text-slate-500">{orden.marca || "—"}</div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg col-span-2">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Problema</div>
              <div className="text-sm text-slate-900">{orden.problema_reportado}</div>
            </div>
          </div>

          {/* Estado actual */}
          <div>
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Estado actual</div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge estado={orden.estado} size="md" />
              {orden.taller_nombre && (
                <span className="text-xs text-purple-600">📍 {orden.taller_nombre}</span>
              )}
              {orden.monto_presupuesto && (
                <span className="text-sm font-bold text-slate-900">
                  ${Number(orden.monto_presupuesto).toLocaleString()} {orden.moneda}
                </span>
              )}
            </div>
            <div className="flex gap-3 mt-2 text-xs text-slate-400">
              <span>{orden.dias_totales} días desde ingreso</span>
              <span>•</span>
              <span>{orden.dias_en_estado} días en estado actual</span>
            </div>
          </div>

          {/* Asignar taller */}
          {showAsignar && (
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-3">
              <div className="text-sm font-semibold text-purple-900">Seleccionar taller</div>
              <select
                value={tallerSelected}
                onChange={(e) => setTallerSelected(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Elegir taller...</option>
                {talleres.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={handleAsignarTaller} disabled={!tallerSelected || loading}
                  className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {loading ? "..." : "Confirmar envío"}
                </button>
                <button onClick={() => setShowAsignar(false)} className="px-4 py-2 border rounded-lg text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Registrar presupuesto */}
          {showPresupuesto && (
            <div className="p-4 bg-cyan-50 rounded-lg border border-cyan-200 space-y-3">
              <div className="text-sm font-semibold text-cyan-900">Registrar presupuesto</div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto en UYU"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <div className="flex gap-2">
                <button onClick={handlePresupuesto} disabled={!monto || loading}
                  className="flex-1 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {loading ? "..." : "Guardar y notificar cliente"}
                </button>
                <button onClick={() => setShowPresupuesto(false)} className="px-4 py-2 border rounded-lg text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Entrega */}
          {showEntrega && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-3">
              <div className="text-sm font-semibold text-green-900">Registrar entrega</div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={`Monto final (${orden.monto_presupuesto || ""})`}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
              <div className="flex gap-2">
                <button onClick={handleEntrega} disabled={loading}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {loading ? "..." : "✓ Confirmar entrega"}
                </button>
                <button onClick={() => setShowEntrega(false)} className="px-4 py-2 border rounded-lg text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Transiciones */}
          {siguientes.length > 0 && !showAsignar && !showPresupuesto && !showEntrega && (
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Cambiar estado
              </div>
              <div className="flex flex-wrap gap-2">
                {siguientes.map((s) => {
                  const next = ESTADOS[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleCambiarEstado(s)}
                      disabled={loading}
                      className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors hover:opacity-80 disabled:opacity-50"
                      style={{
                        borderColor: next.color,
                        backgroundColor: next.bg,
                        color: next.color,
                      }}
                    >
                      {next.icon} {next.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Historial */}
          {historial.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Historial
              </div>
              <div className="space-y-1.5">
                {historial.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 w-24 flex-shrink-0">{formatFechaHora(h.created_at)}</span>
                    {h.estado_anterior && (
                      <>
                        <span className="text-slate-500">{ESTADOS[h.estado_anterior]?.icon}</span>
                        <span className="text-slate-400">→</span>
                      </>
                    )}
                    <span style={{ color: ESTADOS[h.estado_nuevo]?.color }}>
                      {ESTADOS[h.estado_nuevo]?.icon} {ESTADOS[h.estado_nuevo]?.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
