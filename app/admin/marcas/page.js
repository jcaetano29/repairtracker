"use client";

import { useState, useEffect } from "react";
import { getMarcas, crearMarca, updateMarca, deleteMarca } from "@/lib/data";

export default function MarcasPage() {
  const [marcas, setMarcas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingNombre, setEditingNombre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMarcas();
  }, []);

  async function loadMarcas() {
    try {
      const data = await getMarcas({ soloActivas: false });
      setMarcas(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCrear() {
    if (!nombre.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await crearMarca({ nombre: nombre.trim() });
      setNombre("");
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id) {
    if (!editingNombre.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await updateMarca(id, { nombre: editingNombre.trim() });
      setEditingId(null);
      setEditingNombre("");
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActivo(id, activo) {
    setLoading(true);
    try {
      await updateMarca(id, { activo: !activo });
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar esta marca?")) return;
    setLoading(true);
    try {
      await deleteMarca(id);
      await loadMarcas();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-slate-900 mb-6">Marcas</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Crear marca */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Nueva marca..."
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCrear()}
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
        <button
          onClick={handleCrear}
          disabled={!nombre.trim() || loading}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>

      {/* Lista de marcas */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {marcas.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">No hay marcas registradas</div>
        )}
        {marcas.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            {editingId === m.id ? (
              <>
                <input
                  type="text"
                  value={editingNombre}
                  onChange={(e) => setEditingNombre(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdate(m.id)}
                  className="flex-1 px-2 py-1 border rounded text-sm"
                  autoFocus
                />
                <button onClick={() => handleUpdate(m.id)} className="text-xs text-indigo-600 font-semibold">Guardar</button>
                <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">Cancelar</button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm ${m.activo ? "text-slate-900" : "text-slate-400 line-through"}`}>
                  {m.nombre}
                </span>
                <button
                  onClick={() => { setEditingId(m.id); setEditingNombre(m.nombre); }}
                  className="text-xs text-indigo-500 hover:text-indigo-700"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggleActivo(m.id, m.activo)}
                  className={`text-xs ${m.activo ? "text-amber-500" : "text-green-500"}`}
                >
                  {m.activo ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Eliminar
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
