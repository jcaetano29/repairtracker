"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { TIPOS_ARTICULO, MATERIALES } from "@/lib/constants";
import { buscarClientes, crearCliente, crearOrden, getTiposServicio, getSucursales } from "@/lib/data";
import { sanitizePhone } from "@/lib/utils";

export function NuevoIngresoModal({ onClose, onCreated }) {
  const { data: session } = useSession()
  const [step, setStep] = useState(1); // 1: cliente, 2: artículo
  const [clienteQuery, setClienteQuery] = useState("");
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", telefono: "", email: "", documento: "" });
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [form, setForm] = useState({
    tipo_articulo: "Reloj",
    marca: "",
    modelo: "",
    problema_reportado: "",
    notas_internas: "",
    nombre_articulo: "",
    monto_presupuesto: "",
    moneda: "UYU",
    tipo_servicio_id: "",
    sucursal_id: "",
    material: "",
    material_otro: "",
    peso_gramos: "",
  });
  const [tiposServicio, setTiposServicio] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    getTiposServicio().then(setTiposServicio).catch(() => {});
  }, []);

  useEffect(() => {
    getSucursales()
      .then((data) => setSucursales(data.filter((s) => s.activo)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (session?.user?.role !== "admin" && session?.user?.sucursal_id) {
      setForm((f) => ({ ...f, sucursal_id: session.user.sucursal_id }));
    }
  }, [session]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  // Buscar clientes mientras se escribe
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    if (clienteQuery.trim().length < 2) {
      setClientesEncontrados([]);
      return;
    }
    setBuscando(true);
    const timer = setTimeout(async () => {
      try {
        const results = await buscarClientes(clienteQuery.trim());
        setClientesEncontrados(results);
      } catch (e) {
        console.error("Error buscando clientes:", e);
      } finally {
        setBuscando(false);
      }
    }, 150);
    return () => { clearTimeout(timer); setBuscando(false); };
  }, [clienteQuery]);

  async function handleCrearCliente() {
    if (!nuevoCliente.nombre.trim() || !nuevoCliente.telefono.trim() || !nuevoCliente.email.trim() || !nuevoCliente.documento.trim()) return;
    setLoading(true);
    try {
      const cliente = await crearCliente(nuevoCliente);
      setClienteSeleccionado(cliente);
      setCreandoCliente(false);
      setStep(2);
    } catch (e) {
      setError("Error creando cliente: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!clienteSeleccionado || !form.problema_reportado) return;

    if (form.tipo_articulo === "Otro" && !form.nombre_articulo.trim()) {
      setError("Por favor especificá el tipo de artículo.");
      return;
    }

    if (!form.sucursal_id) {
      setError("Seleccioná una sucursal.");
      return;
    }

    if (form.material === "oro" && !form.peso_gramos) {
      setError("El peso es obligatorio para artículos de oro.");
      return;
    }

    if (form.material === "otro" && !form.material_otro.trim()) {
      setError("Especificá el material.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const orden = await crearOrden({
        cliente_id: clienteSeleccionado.id,
        tipo_articulo: form.tipo_articulo,
        marca: form.marca,
        modelo: form.modelo,
        problema_reportado: form.problema_reportado,
        notas_internas: form.notas_internas,
        nombre_articulo: form.tipo_articulo === "Otro" ? form.nombre_articulo : null,
        monto_presupuesto: form.monto_presupuesto ? parseFloat(form.monto_presupuesto) : null,
        moneda: form.moneda,
        tipo_servicio_id: form.tipo_servicio_id || null,
        sucursal_id: form.sucursal_id,
        material: form.material || null,
        material_otro: form.material === "otro" ? form.material_otro : null,
        peso_gramos: form.peso_gramos ? parseFloat(form.peso_gramos) : null,
      });
      onCreated(orden);
      onClose();
    } catch (e) {
      setError("Error creando orden: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">📥 Nuevo Ingreso</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Paso {step} de 2 — {step === 1 ? "Cliente" : "Artículo"}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* STEP 1: Seleccionar cliente */}
          {step === 1 && !creandoCliente && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Buscar cliente por nombre o teléfono
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ej: Juan, 099..."
                  value={clienteQuery}
                  onChange={(e) => setClienteQuery(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {buscando && clienteQuery.trim().length >= 2 && clientesEncontrados.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-2">Buscando...</div>
              )}

              {!buscando && clienteQuery.trim().length >= 2 && clientesEncontrados.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-2">No se encontraron clientes</div>
              )}

              {clientesEncontrados.length > 0 && (
                <div className="space-y-1.5">
                  {clientesEncontrados.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setClienteSeleccionado(c);
                        setStep(2);
                      }}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                    >
                      <div className="font-semibold text-sm text-slate-900">{c.nombre}</div>
                      <div className="text-xs text-slate-500">{c.telefono} {c.documento ? `• ${c.documento}` : ""}</div>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setCreandoCliente(true)}
                className="w-full p-3 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              >
                + Crear cliente nuevo
              </button>
            </div>
          )}

          {/* STEP 1b: Crear cliente nuevo */}
          {step === 1 && creandoCliente && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setCreandoCliente(false);
                  setClienteQuery("");
                  setClientesEncontrados([]);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                ← Volver a buscar
              </button>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Cédula / RUT *
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ej: 1.234.567-8"
                  value={nuevoCliente.documento}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, documento: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Nombre *
                </label>
                <input
                  type="text"
                  placeholder="Nombre completo"
                  value={nuevoCliente.nombre}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  placeholder="099 123 456"
                  value={nuevoCliente.telefono}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: sanitizePhone(e.target.value) })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Email *
                </label>
                <input
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={nuevoCliente.email}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <button
                onClick={handleCrearCliente}
                disabled={!nuevoCliente.nombre || !nuevoCliente.telefono || !nuevoCliente.email || !nuevoCliente.documento || loading}
                className="w-full py-3 bg-indigo-500 text-white rounded-lg font-semibold text-sm hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creando..." : "Crear cliente y continuar →"}
              </button>
            </div>
          )}

          {/* STEP 2: Datos del artículo */}
          {step === 2 && (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setStep(1);
                  setClienteSeleccionado(null);
                  setClienteQuery("");
                  setClientesEncontrados([]);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                ← Cambiar cliente
              </button>

              {/* Cliente seleccionado */}
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="text-xs text-indigo-500 font-semibold">CLIENTE</div>
                <div className="text-sm font-bold text-slate-900">{clienteSeleccionado?.nombre}</div>
                <div className="text-xs text-slate-500">{clienteSeleccionado?.telefono}</div>
              </div>

              {/* Sucursal */}
              <div>
                <label htmlFor="sucursal_id" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Sucursal *
                </label>
                {session?.user?.role === "admin" ? (
                  <select
                    id="sucursal_id"
                    aria-required="true"
                    value={form.sucursal_id}
                    onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Seleccioná una sucursal</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                    {sucursales.length === 0
                      ? "Cargando..."
                      : sucursales.find((s) => s.id === form.sucursal_id)?.nombre ?? "Sin sucursal asignada"}
                  </div>
                )}
              </div>

              {/* Tipo de artículo */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Tipo de artículo
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TIPOS_ARTICULO.map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm({ ...form, tipo_articulo: t })}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.tipo_articulo === t
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional: "Otro" text input */}
              {form.tipo_articulo === "Otro" && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ¿Qué tipo de artículo es?
                  </label>
                  <input
                    type="text"
                    value={form.nombre_articulo}
                    onChange={(e) => setForm({ ...form, nombre_articulo: e.target.value })}
                    placeholder="Ej: Consola de videojuegos, Impresora..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
              )}

              {/* Material */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Material
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {MATERIALES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm({ ...form, material: form.material === m.value ? "" : m.value, material_otro: "" })}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.material === m.value
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Material otro - texto libre */}
              {form.material === "otro" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ¿Qué material es?
                  </label>
                  <input
                    type="text"
                    value={form.material_otro}
                    onChange={(e) => setForm({ ...form, material_otro: e.target.value })}
                    placeholder="Ej: Titanio, Platino..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
              )}

              {/* Peso */}
              {form.material && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Peso (gramos){form.material === "oro" ? " *" : ""}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.peso_gramos}
                    onChange={(e) => setForm({ ...form, peso_gramos: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  {form.material === "oro" && (
                    <p className="text-xs text-amber-600 mt-1">Obligatorio para artículos de oro.</p>
                  )}
                </div>
              )}

              {/* Presupuesto (optional) */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Presupuesto (opcional)
                </label>
                <div className="flex gap-2">
                  <select
                    value={form.moneda}
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="UYU">$U</option>
                    <option value="USD">US$</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monto_presupuesto}
                    onChange={(e) => setForm({ ...form, monto_presupuesto: e.target.value })}
                    placeholder="0.00"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Completá si ya tenés el monto. Podés dejarlo vacío y cargarlo después.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Marca
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ej: Casio, Tissot, Oro 18k..."
                  value={form.marca}
                  onChange={(e) => setForm({ ...form, marca: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Problema reportado *
                </label>
                <textarea
                  placeholder="Describa el problema..."
                  value={form.problema_reportado}
                  onChange={(e) => setForm({ ...form, problema_reportado: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Notas internas (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Notas para uso interno..."
                  value={form.notas_internas}
                  onChange={(e) => setForm({ ...form, notas_internas: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {tiposServicio.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Tipo de servicio (opcional)
                  </label>
                  <select
                    value={form.tipo_servicio_id}
                    onChange={(e) => setForm({ ...form, tipo_servicio_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">Sin recordatorio de mantenimiento</option>
                    {tiposServicio.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} — cada {t.ciclo_meses} meses
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Si seleccionás un servicio, el cliente recibirá un recordatorio por email cuando sea hora de renovarlo.
                  </p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!form.problema_reportado || !form.sucursal_id || loading}
                className="w-full py-3 bg-indigo-500 text-white rounded-lg font-bold text-sm hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Registrando..." : "✓ Registrar Ingreso"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
