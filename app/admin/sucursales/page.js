"use client"

import { useState, useEffect } from "react"

export default function SucursalesPage() {
  const [sucursales, setSucursales] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState("")
  const [editando, setEditando] = useState(null) // { id, nombre }
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/sucursales")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { sucursales } = await res.json()
      setSucursales(sucursales || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch("/api/admin/sucursales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`Sucursal "${nombre}" creada`)
      setNombre("")
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggleActivo(s) {
    setError(null)
    try {
      const res = await fetch("/api/admin/sucursales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursalId: s.id, activo: !s.activo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleEditNombre(e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch("/api/admin/sucursales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursalId: editando.id, nombre: editando.nombre }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setEditando(null)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Sucursales</h2>
          <p className="text-sm text-slate-500 mt-0.5">Gestioná las sucursales del negocio</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); setSuccess(null) }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          + Nueva sucursal
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="font-semibold text-slate-900 mb-4">Nueva sucursal</h3>
          <div className="flex gap-3">
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre de la sucursal"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <button type="submit" className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600">
              Crear
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sucursales.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {editando?.id === s.id ? (
                      <form onSubmit={handleEditNombre} className="flex gap-2">
                        <input
                          autoFocus
                          value={editando.nombre}
                          onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                          className="px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button type="submit" className="text-xs text-indigo-600 font-semibold">Guardar</button>
                        <button type="button" onClick={() => setEditando(null)} className="text-xs text-slate-400">Cancelar</button>
                      </form>
                    ) : (
                      <span className="font-medium text-slate-900">{s.nombre}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${s.activo ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {s.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right flex gap-3 justify-end">
                    <button
                      onClick={() => setEditando({ id: s.id, nombre: s.nombre })}
                      className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                    >
                      Renombrar
                    </button>
                    <button
                      onClick={() => handleToggleActivo(s)}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                    >
                      {s.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
              {sucursales.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 text-sm">No hay sucursales</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
