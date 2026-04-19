// app/cadete/page.js
"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"

export default function CadetePage() {
  const { data: session } = useSession()
  const [resumenes, setResumenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState({})

  // Load checked state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cadete_checks")
      if (stored) setChecked(JSON.parse(stored))
    } catch {}
  }, [])

  // Save checked state to localStorage
  function toggleCheck(itemId) {
    setChecked((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] }
      try { localStorage.setItem("cadete_checks", JSON.stringify(next)) } catch {}
      return next
    })
  }

  const loadResumenes = useCallback(async () => {
    try {
      const res = await fetch("/api/cadete/resumenes")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { resumenes: data } = await res.json()
      setResumenes(data || [])

      // Clean up localStorage: remove checks for items that no longer exist
      const activeItemIds = new Set()
      for (const r of data || []) {
        for (const item of r.items || []) {
          activeItemIds.add(item.item_id)
        }
      }
      setChecked((prev) => {
        const cleaned = {}
        for (const [k, v] of Object.entries(prev)) {
          if (activeItemIds.has(k)) cleaned[k] = v
        }
        try { localStorage.setItem("cadete_checks", JSON.stringify(cleaned)) } catch {}
        return cleaned
      })
    } catch (e) {
      console.error("Error cargando resumenes:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadResumenes() }, [loadResumenes])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadResumenes, 30000)
    return () => clearInterval(interval)
  }, [loadResumenes])

  function getTrasladoLabel(item) {
    const action = item.traslado_tipo === "ida" ? "Llevar a" : "Retirar de"
    const destination = item.traslado_tipo === "ida"
      ? item.sucursal_destino_nombre
      : item.sucursal_origen_nombre
    const article = [item.tipo_articulo, item.marca, item.modelo].filter(Boolean).join(" — ")
    return { action, destination, article }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/cadete" className="flex items-center gap-3">
            <span className="text-2xl">🚚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-sm text-slate-400">
                {session?.user?.username ? `Cadete: ${session.user.username}` : "Cadete"}
              </p>
            </div>
          </a>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
        {loading && (
          <div className="text-center py-20 text-slate-400">Cargando...</div>
        )}

        {!loading && resumenes.length === 0 && (
          <div className="text-center py-20">
            <span className="text-4xl block mb-3">📋</span>
            <p className="text-slate-500 text-sm">No tenes tareas asignadas</p>
          </div>
        )}

        {!loading && resumenes.map((resumen) => (
          <div key={resumen.id} className="mb-6">
            {/* Resumen header */}
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                {resumen.nombre || "Tareas asignadas"}
              </h2>
              <span className="text-xs text-slate-400">
                ({resumen.items.length} {resumen.items.length === 1 ? "item" : "items"})
              </span>
            </div>

            {resumen.items.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                Sin items en este resumen
              </div>
            )}

            <div className="space-y-2">
              {resumen.items.map((item) => {
                const isChecked = !!checked[item.item_id]

                if (item.tipo === "traslado") {
                  const { action, destination, article } = getTrasladoLabel(item)
                  return (
                    <div
                      key={item.item_id}
                      onClick={() => toggleCheck(item.item_id)}
                      className={`bg-white rounded-xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${
                        isChecked
                          ? "border-green-300 bg-green-50/50 opacity-60"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isChecked
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-slate-300"
                        }`}>
                          {isChecked && <span className="text-xs font-bold">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              item.traslado_tipo === "ida"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {item.traslado_tipo === "ida" ? "↑ LLEVAR" : "↓ RETIRAR"}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{article || "Articulo"}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {action} <span className="font-semibold text-slate-700">{destination}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }

                if (item.tipo === "orden") {
                  const action = item.subtipo === "retirar_de_taller" ? "Retirar de" : "Llevar a"
                  const destination = item.orden_taller_nombre
                  const article = [item.tipo_articulo, item.marca, item.modelo].filter(Boolean).join(" — ")
                  return (
                    <div
                      key={item.item_id}
                      onClick={() => toggleCheck(item.item_id)}
                      className={`bg-white rounded-xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${
                        isChecked
                          ? "border-green-300 bg-green-50/50 opacity-60"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isChecked
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-slate-300"
                        }`}>
                          {isChecked && <span className="text-xs font-bold">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              item.subtipo === "retirar_de_taller"
                                ? "bg-teal-100 text-teal-700"
                                : "bg-purple-100 text-purple-700"
                            }`}>
                              {item.subtipo === "retirar_de_taller" ? "↓ RETIRAR" : "↑ LLEVAR"}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{article || "Articulo"}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {action} <span className="font-semibold text-slate-700">{destination}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }

                // Ad-hoc item
                return (
                  <div
                    key={item.item_id}
                    onClick={() => toggleCheck(item.item_id)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${
                      isChecked
                        ? "border-green-300 bg-green-50/50 opacity-60"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isChecked
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-slate-300"
                      }`}>
                        {isChecked && <span className="text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 mb-1 inline-block">
                          TAREA
                        </span>
                        <p className="text-sm text-slate-900 mt-1">{item.descripcion}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
