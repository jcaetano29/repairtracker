"use client";

import { useState, useEffect } from "react";
import { Badge } from "./Badge";
import { ESTADOS, TRANSICIONES, getNivelRetraso, formatFechaHora, formatNumeroOrden } from "@/lib/constants";
import { cambiarEstado, asignarTaller, registrarPresupuesto, entregarAlCliente, getHistorial, getTalleres, deleteOrden, aprobarPresupuesto, rechazarPresupuesto, updateSucursalRetiro, getSucursales } from "@/lib/data";
import { formatMonto, monedaPrefix } from "@/lib/currency";
import { getTrasladosByOrden } from "@/lib/traslados";
import { TrasladosBadge } from "./TrasladosBadge";

export function DetalleOrdenModal({ orden, onClose, onUpdated, isDueno, umbrales }) {
  const [loading, setLoading] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [talleres, setTalleresState] = useState([]);
  const [showAsignar, setShowAsignar] = useState(false);
  const [showPresupuesto, setShowPresupuesto] = useState(false);
  const [showEntrega, setShowEntrega] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState(orden.moneda || "UYU");
  const [tallerSelected, setTallerSelected] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [error, setError] = useState(null);
  const [notificarPresupuesto, setNotificarPresupuesto] = useState(false);
  const [showRetiro, setShowRetiro] = useState(false);
  const [notificarRetiro, setNotificarRetiro] = useState(true);
  const [plantillas, setPlantillas] = useState({});
  const [trasladosHistorial, setTrasladosHistorial] = useState([]);
  const [sucursales, setSucursalesState] = useState([]);
  const [editingRetiro, setEditingRetiro] = useState(false);
  const [retiroId, setRetiroId] = useState(orden.sucursal_retiro_id || "");

  const retraso = getNivelRetraso(orden.estado, orden.dias_en_estado, umbrales);
  const siguientes = TRANSICIONES[orden.estado] || [];

  // State transition blocking logic (Task 6)
  const trasladoActivo = orden.traslado_activo_id ? {
    id: orden.traslado_activo_id,
    tipo: orden.traslado_activo_tipo,
    estado: orden.traslado_activo_estado,
  } : null;

  const bloqueadoPorTraslado = trasladoActivo && (
    (trasladoActivo.tipo === "ida" && ["pendiente", "en_transito"].includes(trasladoActivo.estado)) ||
    (trasladoActivo.tipo === "retorno" && ["pendiente", "en_transito"].includes(trasladoActivo.estado))
  );

  const estadosBloqueados = [];
  if (trasladoActivo?.tipo === "ida" && trasladoActivo.estado !== "recibido") {
    estadosBloqueados.push(...Object.keys(ESTADOS));
  }
  if (trasladoActivo?.tipo === "retorno" && trasladoActivo.estado !== "recibido") {
    estadosBloqueados.push("ENTREGADO");
  }

  useEffect(() => {
    loadData();
  }, [orden.id]);

  async function loadData() {
    try {
      const [h, t, pRes, trasladosData, sucursalesRes] = await Promise.all([
        getHistorial(orden.id),
        getTalleres(),
        fetch("/api/admin/plantillas-email").then(r => r.ok ? r.json() : Promise.resolve({ plantillas: [] })),
        getTrasladosByOrden(orden.id),
        getSucursales(),
      ]);
      setHistorial(h);
      setTalleresState(t);
      const map = {};
      (pRes.plantillas || []).forEach(p => { map[p.tipo] = p.cuerpo; });
      setPlantillas(map);
      setTrasladosHistorial(trasladosData);
      setSucursalesState(sucursalesRes || []);
    } catch (e) {
      console.error(e);
    }
  }

  function buildPreview(tipo, extras = {}) {
    const template = plantillas[tipo] || "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const vars = {
      clienteNombre: orden.cliente_nombre,
      numeroOrden: formatNumeroOrden(orden.numero_orden),
      tipoArticulo: orden.tipo_articulo,
      trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
      ...extras,
    };
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  async function triggerNotify(type, extras = {}) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        data: {
          clienteTelefono: orden.cliente_telefono,
          clienteEmail: orden.cliente_email,
          clienteNombre: orden.cliente_nombre,
          numeroOrden: formatNumeroOrden(orden.numero_orden),
          tipoArticulo: orden.tipo_articulo,
          trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
          ...extras,
        },
      }),
    });
    if (!res.ok) {
      throw new Error("Error al enviar notificación");
    }
  }

  async function handleCambiarEstado(nuevoEstado) {
    // Si va a taller, mostrar selector
    if (nuevoEstado === "EN_TALLER") {
      setShowAsignar(true);
      return;
    }
    // Si pasa a ESPERANDO_APROBACION, mostrar panel de presupuesto
    // (siempre mostrar para permitir notificar por email, incluso si ya hay monto)
    if (nuevoEstado === "ESPERANDO_APROBACION") {
      if (orden.monto_presupuesto) setMonto(String(orden.monto_presupuesto));
      setShowPresupuesto(true);
      return;
    }
    // Si pasa a ENTREGADO, pedir pago
    if (nuevoEstado === "ENTREGADO") {
      setShowEntrega(true);
      return;
    }
    // Si pasa a LISTO_PARA_RETIRO, mostrar panel con checkbox de notificación
    if (nuevoEstado === "LISTO_PARA_RETIRO") {
      setShowRetiro(true);
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
      await registrarPresupuesto(orden.id, parseFloat(monto), moneda);
      if (notificarPresupuesto && orden.cliente_email) {
        try {
          await triggerNotify("PRESUPUESTO", { monto: parseFloat(monto).toLocaleString("es-UY"), moneda: monedaPrefix(moneda) });
        } catch (e) {
          console.error("[Notify] Error al enviar presupuesto:", e);
        }
      }
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAprobar() {
    setLoading(true);
    setError(null);
    try {
      await aprobarPresupuesto(orden.id);
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRechazar() {
    setLoading(true);
    setError(null);
    try {
      await rechazarPresupuesto(orden.id);
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetiro() {
    setLoading(true);
    setError(null);
    try {
      await cambiarEstado(orden.id, "LISTO_PARA_RETIRO");

      // Auto-create return transfer if pickup branch differs from current location (Task 5)
      if (orden.sucursal_retiro_id && orden.sucursal_id && orden.sucursal_retiro_id !== orden.sucursal_id) {
        try {
          await fetch("/api/traslados/retorno", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orden_id: orden.id }),
          });
        } catch (e) {
          console.error("[Traslado] Error creating return transfer:", e);
          setError("Orden marcada como lista, pero no se pudo crear el traslado de retorno.");
        }
      }

      // Only notify if the order doesn't need a return transfer
      // (if it does, notification will be sent when the return transfer is received)
      const needsRetorno = orden.sucursal_retiro_id && orden.sucursal_id && orden.sucursal_retiro_id !== orden.sucursal_id;
      if (!needsRetorno && notificarRetiro && orden.cliente_email) {
        try {
          await triggerNotify("LISTO_PARA_RETIRO");
        } catch (e) {
          console.error("[Notify] Error al enviar listo para retiro:", e);
        }
      }
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

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      await deleteOrden(orden.id);
      onUpdated();
      onClose();
    } catch (e) {
      setError(e.message);
      setShowConfirmDelete(false);
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
              {retraso === "grave" ? "🔴 Retraso grave" : "⚠️ Posible retraso"} ({orden.dias_en_estado} días en este estado)
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
              {orden.material && (
                <div className="text-xs text-slate-500 mt-1">
                  Material: {orden.material === "otro" ? orden.material_otro : orden.material.charAt(0).toUpperCase() + orden.material.slice(1)}
                  {orden.peso_gramos != null ? ` — ${orden.peso_gramos} g` : ""}
                </div>
              )}
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
                  {formatMonto(orden.monto_presupuesto, orden.moneda)}
                </span>
              )}
            </div>
            <div className="flex gap-3 mt-2 text-xs text-slate-400">
              <span>{orden.dias_totales}d desde ingreso</span>
              <span>•</span>
              <span>{orden.dias_en_estado}d en este estado</span>
            </div>
          </div>

          {/* Ubicación actual */}
          <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <span className="text-sm">📍</span>
            <div>
              <div className="text-[10px] text-indigo-400 font-semibold uppercase">Ubicación actual</div>
              <div className="text-sm font-bold text-indigo-900">{orden.sucursal_nombre}</div>
            </div>
            {trasladoActivo && (
              <div className="ml-auto">
                <TrasladosBadge tipo={trasladoActivo.tipo} estado={trasladoActivo.estado} />
              </div>
            )}
          </div>

          {/* Sucursales info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Recepción</div>
              <div className="text-sm font-semibold text-slate-900">
                {orden.sucursal_recepcion_nombre || orden.sucursal_nombre}
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Retiro</div>
              {!editingRetiro ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {orden.sucursal_retiro_nombre || orden.sucursal_nombre}
                  </span>
                  {orden.estado !== "ENTREGADO" && (
                    <button
                      onClick={() => setEditingRetiro(true)}
                      className="text-[10px] text-indigo-500 hover:text-indigo-700"
                    >
                      Cambiar
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <select
                    value={retiroId}
                    onChange={(e) => setRetiroId(e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-xs"
                  >
                    {sucursales.filter(s => s.activo).map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await updateSucursalRetiro(orden.id, retiroId);
                        setEditingRetiro(false);
                        onUpdated();
                      } catch (e) {
                        setError(e.message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="px-2 py-1 bg-indigo-500 text-white rounded text-[10px] font-semibold disabled:opacity-50"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => { setEditingRetiro(false); setRetiroId(orden.sucursal_retiro_id || ""); }}
                    className="px-2 py-1 border rounded text-[10px]"
                  >
                    X
                  </button>
                </div>
              )}
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
              <div className="flex gap-2">
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="px-2 py-2 border rounded-lg text-sm"
                >
                  <option value="UYU">$U</option>
                  <option value="USD">US$</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Monto"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              {orden.cliente_email && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificarPresupuesto}
                    onChange={(e) => setNotificarPresupuesto(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold">Notificar al cliente por email</span>
                    {notificarPresupuesto && monto && (
                      <div className="mt-1 p-2 bg-white rounded border border-slate-200 text-[11px] text-slate-500 whitespace-pre-line">
                        {buildPreview("PRESUPUESTO", { monto: parseFloat(monto).toLocaleString("es-UY"), moneda: monedaPrefix(moneda) })}
                      </div>
                    )}
                  </div>
                </label>
              )}
              <div className="flex gap-2">
                <button onClick={handlePresupuesto} disabled={!monto || loading}
                  className="flex-1 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {loading ? "..." : "Guardar presupuesto"}
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

          {/* Confirmar listo para retiro con notificación */}
          {showRetiro && (
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 space-y-3">
              <div className="text-sm font-semibold text-emerald-900">Marcar como listo para retiro</div>
              {orden.cliente_email && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificarRetiro}
                    onChange={(e) => setNotificarRetiro(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold">Notificar al cliente por email</span>
                    {notificarRetiro && (
                      <div className="mt-1 p-2 bg-white rounded border border-slate-200 text-[11px] text-slate-500 whitespace-pre-line">
                        {buildPreview("LISTO_PARA_RETIRO")}
                      </div>
                    )}
                  </div>
                </label>
              )}
              <div className="flex gap-2">
                <button onClick={handleRetiro} disabled={loading}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                  {loading ? "..." : "✓ Confirmar listo para retiro"}
                </button>
                <button onClick={() => setShowRetiro(false)} className="px-4 py-2 border rounded-lg text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Aprobar / Rechazar presupuesto */}
          {orden.estado === "ESPERANDO_APROBACION" && !showAsignar && !showPresupuesto && !showEntrega && !showRetiro && (
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Decisión del presupuesto
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAprobar}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: "#3b82f6", backgroundColor: "#eff6ff", color: "#3b82f6" }}
                >
                  ✓ Aprobar presupuesto
                </button>
                <button
                  onClick={handleRechazar}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: "#ef4444", backgroundColor: "#fef2f2", color: "#ef4444" }}
                >
                  ✗ Rechazar
                </button>
              </div>
            </div>
          )}

          {/* Transfer blocking alert (Task 6) */}
          {bloqueadoPorTraslado && (
            <div className="p-3 rounded-lg text-sm border bg-blue-50 border-blue-200 text-blue-800">
              {trasladoActivo.tipo === "ida"
                ? "📦 Esta orden tiene un traslado pendiente. No se puede avanzar hasta que llegue al centro de reparación."
                : "📦 Esta orden tiene un traslado de retorno pendiente. No se puede entregar hasta que llegue a la sucursal de retiro."}
            </div>
          )}

          {/* Transiciones genéricas (todos los estados excepto ESPERANDO_APROBACION) */}
          {orden.estado !== "ESPERANDO_APROBACION" && siguientes.length > 0 && !showAsignar && !showPresupuesto && !showEntrega && !showRetiro && (
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Cambiar estado
              </div>
              <div className="flex flex-wrap gap-2">
                {siguientes
                  .filter((s) => !estadosBloqueados.includes(s))
                  .map((s) => {
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
                        {next.icon} {orden.estado === "INGRESADO" && s === "ESPERANDO_APROBACION" ? "Presupuestar en local" : next.label}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Eliminar orden — admins siempre, employees solo en INGRESADO */}
          {(isDueno || orden.estado === "INGRESADO") && (
            <div className="pt-2 border-t border-slate-100">
              {!showConfirmDelete ? (
                <button
                  onClick={() => setShowConfirmDelete(true)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Eliminar orden
                </button>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
                  <div className="text-sm font-semibold text-red-800">¿Eliminar esta orden?</div>
                  <div className="text-xs text-red-600">Esta acción no se puede deshacer.</div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={loading}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                    >
                      {loading ? "..." : "Sí, eliminar"}
                    </button>
                    <button
                      onClick={() => setShowConfirmDelete(false)}
                      className="px-4 py-2 border rounded-lg text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Traslados historial */}
          {trasladosHistorial.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                Traslados
              </div>
              <div className="space-y-1.5">
                {trasladosHistorial.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 w-24 flex-shrink-0">{formatFechaHora(t.created_at)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">
                      {t.tipo === "ida" ? "Ida" : "Retorno"}
                    </span>
                    <TrasladosBadge tipo={t.tipo} estado={t.estado} />
                    {t.estado === "recibido" && t.fecha_recepcion && (
                      <span className="text-slate-400">
                        Recibido: {formatFechaHora(t.fecha_recepcion)}
                      </span>
                    )}
                  </div>
                ))}
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
