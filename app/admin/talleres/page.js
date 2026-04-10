"use client";

import { useState, useEffect } from "react";
import { getTalleres, crearTaller, updateTaller, deleteTaller } from "@/lib/data";
import { sanitizePhone } from "@/lib/utils";

export default function TalleresPage() {
  const [talleres, setTalleres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ nombre: "", telefono: "", email: "", direccion: "" });
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setTalleres(await getTalleres());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.nombre) return;
    setError(null);
    try {
      if (editingId) {
        await updateTaller(editingId, form);
      } else {
        await crearTaller(form);
      }
      setShowNew(false);
      setEditingId(null);
      setForm({ nombre: "", telefono: "", email: "", direccion: "" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este taller? Esta acción no se puede deshacer.")) return;
    try {
      await deleteTaller(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function startEdit(taller) {
    setEditingId(taller.id);
    setForm({
      nombre: taller.nombre || "",
      telefono: taller.telefono || "",
      email: taller.email || "",
      direccion: taller.direccion || "",
    });
    setShowNew(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Talleres</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Administrá los talleres asociados
          </p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditingId(null); setForm({ nombre: "", telefono: "", email: "", direccion: "" }); }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          + Agregar taller
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Form */}
      {showNew && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="font-semibold text-slate-900 mb-4">
            {editingId ? "Editar taller" : "Nuevo taller"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Nombre *
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Taller Central"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Teléfono
              </label>
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: sanitizePhone(e.target.value) })}
                placeholder="Ej: +598 9 1234 5678"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Ej: taller@example.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Dirección
              </label>
              <input
                type="text"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Ej: Calle Principal 123"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={!form.nombre}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
            >
              {editingId ? "Guardar cambios" : "Crear taller"}
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
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Teléfono</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Dirección</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {talleres.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{t.telefono || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{t.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{t.direccion || "—"}</td>
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
              {talleres.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No hay talleres registrados
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
