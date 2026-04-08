"use client";

import { useState, useEffect } from "react";
import { getTiposServicio, crearTipoServicio, updateTipoServicio, deleteTipoServicio } from "@/lib/data";

export default function TiposServicioPage() {
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ nombre: "", ciclo_meses: 12 });
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setTipos(await getTiposServicio());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.nombre || !form.ciclo_meses) return;
    setError(null);
    try {
      if (editingId) {
        await updateTipoServicio(editingId, form);
      } else {
        await crearTipoServicio(form);
      }
      setShowNew(false);
      setEditingId(null);
      setForm({ nombre: "", ciclo_meses: 12 });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este tipo de servicio?")) return;
    try {
      await deleteTipoServicio(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(tipo) {
    setEditingId(tipo.id);
    setForm({ nombre: tipo.nombre, ciclo_meses: tipo.ciclo_meses });
    setShowNew(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tipos de servicio</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configurá los ciclos de recordatorio por tipo de servicio
          </p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditingId(null); setForm({ nombre: "", ciclo_meses: 12 }); }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          + Agregar tipo
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Form */}
      {showNew && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="font-semibold text-slate-900 mb-4">
            {editingId ? "Editar tipo" : "Nuevo tipo de servicio"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Nombre
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Cambio de pila"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Ciclo de recordatorio (meses)
              </label>
              <input
                type="number"
                value={form.ciclo_meses}
                onChange={(e) => setForm({ ...form, ciclo_meses: e.target.value })}
                min="1"
                max="120"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={!form.nombre || !form.ciclo_meses}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
            >
              {editingId ? "Guardar cambios" : "Crear tipo"}
            </button>
            <button
              onClick={() => { setShowNew(false); setEditingId(null); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tipo de servicio</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ciclo de recordatorio</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">
                    Cada <span className="font-bold">{t.ciclo_meses}</span> meses
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tipos.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No hay tipos de servicio configurados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
