"use client";

import { useState, useEffect, useRef } from "react";
import { TIPOS_ARTICULO } from "@/lib/constants";
import { buscarClientes, crearCliente, crearOrden } from "@/lib/data";

export function NuevoIngresoModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1); // 1: cliente, 2: artículo
  const [clienteQuery, setClienteQuery] = useState("");
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", telefono: "", email: "" });
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [form, setForm] = useState({
    tipo_articulo: "Reloj",
    marca: "",
    modelo: "",
    problema_reportado: "",
    notas_internas: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  // Buscar clientes mientras se escribe
  useEffect(() => {
    if (clienteQuery.length < 2) {
      setClientesEncontrados([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await buscarClientes(clienteQuery);
        setClientesEncontrados(results);
      } catch (e) {
        console.error("Error buscando clientes:", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clienteQuery]);

  async function handleCrearCliente() {
    if (!nuevoCliente.nombre || !nuevoCliente.telefono) return;
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
    setLoading(true);
    setError(null);
    try {
      const orden = await crearOrden({
        cliente_id: clienteSeleccionado.id,
        ...form,
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
                      <div className="text-xs text-slate-500">{c.telefono}</div>
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
                onClick={() => setCreandoCliente(false)}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                ← Volver a buscar
              </button>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Nombre *
                </label>
                <input
                  ref={inputRef}
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
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Email (opcional)
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
                disabled={!nuevoCliente.nombre || !nuevoCliente.telefono || loading}
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
                onClick={() => setStep(1)}
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

              <button
                onClick={handleSubmit}
                disabled={!form.problema_reportado || loading}
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
