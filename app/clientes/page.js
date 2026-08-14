"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import PhoneInput from "@/components/PhoneInput"

async function jsonFetch(url, opts) {
  const res = await fetch(url, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const emptyForm = { nombre: "", telefono: "", email: "", documento: "" }

export default function ClientesPage() {
  const [busqueda, setBusqueda] = useState("")
  const [debounced, setDebounced] = useState("")
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [editando, setEditando] = useState(null) // cliente en edición
  const [form, setForm] = useState(emptyForm)
  const [guardando, setGuardando] = useState(false)
  const [editError, setEditError] = useState(null)
  const [okMsg, setOkMsg] = useState(null)

  const searchTimeoutRef = useRef(null)

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => setDebounced(busqueda.trim()), 350)
    return () => clearTimeout(searchTimeoutRef.current)
  }, [busqueda])

  const buscar = useCallback(async (q) => {
    if (!q) {
      setClientes([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { clientes } = await jsonFetch(`/api/clientes?q=${encodeURIComponent(q)}`)
      setClientes(clientes || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    buscar(debounced)
  }, [debounced, buscar])

  function abrirEdicion(cliente) {
    setEditando(cliente)
    setForm({
      nombre: cliente.nombre || "",
      telefono: cliente.telefono || "",
      email: cliente.email || "",
      documento: cliente.documento || "",
    })
    setEditError(null)
  }

  function cerrarEdicion() {
    setEditando(null)
    setForm(emptyForm)
    setEditError(null)
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.telefono.trim() || !form.documento.trim()) {
      setEditError("Nombre, teléfono y documento son obligatorios.")
      return
    }
    setGuardando(true)
    setEditError(null)
    try {
      const { cliente } = await jsonFetch(`/api/clientes/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      // Reflejar el cambio en la lista sin volver a buscar.
      setClientes((prev) => prev.map((c) => (c.id === cliente.id ? cliente : c)))
      setOkMsg("Cliente actualizado")
      setTimeout(() => setOkMsg(null), 2500)
      cerrarEdicion()
    } catch (e) {
      setEditError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Clientes</h1>
            <p className="text-sm text-slate-500">Buscar y corregir datos</p>
          </div>
          <Link href="/" className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors">
            ← Volver
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {okMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{okMsg}</div>
        )}

        {/* Buscador */}
        <input
          type="text"
          autoFocus
          placeholder="Buscar por nombre, teléfono o documento..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 mb-4"
        />

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {/* Resultados */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
          {loading && (
            <div className="p-6 text-center text-sm text-slate-400">Buscando…</div>
          )}
          {!loading && debounced && clientes.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-400">No se encontraron clientes</div>
          )}
          {!loading && !debounced && (
            <div className="p-6 text-center text-sm text-slate-400">Escribí para buscar un cliente</div>
          )}
          {clientes.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{c.nombre}</div>
                <div className="text-xs text-slate-500 truncate">
                  {c.telefono || "sin teléfono"} · {c.documento || "sin documento"}
                  {c.email ? ` · ${c.email}` : ""}
                </div>
              </div>
              <button
                onClick={() => abrirEdicion(c)}
                className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold shrink-0"
              >
                Editar
              </button>
            </div>
          ))}
        </div>
      </main>

      {/* Modal de edición */}
      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={cerrarEdicion}>
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Editar cliente</h2>
              <button onClick={cerrarEdicion} className="text-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{editError}</div>
              )}
              <div>
                <label className="block text-xs text-slate-400 font-semibold tracking-wider mb-1">NOMBRE</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 font-semibold tracking-wider mb-1">TELÉFONO</label>
                <PhoneInput value={form.telefono} onChange={(v) => setForm((f) => ({ ...f, telefono: v }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 font-semibold tracking-wider mb-1">EMAIL</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 font-semibold tracking-wider mb-1">DOCUMENTO</label>
                <input
                  type="text"
                  value={form.documento}
                  onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-2 justify-end">
              <button
                onClick={cerrarEdicion}
                disabled={guardando}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
