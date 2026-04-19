// components/ResumenCadetePanel.js
"use client"

import { useState, useEffect } from "react"

export function ResumenCadetePanel({ onClose, sucursalId, isDueno }) {
  const [resumenes, setResumenes] = useState([])
  const [cadetes, setCadetes] = useState([])
  const [traslados, setTraslados] = useState([])
  const [ordenesPendientes, setOrdenesPendientes] = useState({ retirar_de_taller: [], llevar_a_taller: [] })
  const [loading, setLoading] = useState(true)
  const [selectedResumen, setSelectedResumen] = useState(null)
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newCadeteId, setNewCadeteId] = useState("")
  const [newNombre, setNewNombre] = useState("")

  // Ad-hoc form
  const [adHocText, setAdHocText] = useState("")

  // Error
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [resRes, cadRes] = await Promise.all([
        fetch("/api/resumenes-cadete"),
        fetch("/api/resumenes-cadete/cadetes"),
      ])

      const { resumenes: resData } = await resRes.json()
      const { cadetes: cadData } = await cadRes.json()

      setResumenes(resData || [])
      setCadetes(cadData || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadItems(resumenId) {
    setLoadingItems(true)
    try {
      const res = await fetch(`/api/resumenes-cadete/${resumenId}/items`)
      const { items: data } = await res.json()
      setItems(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingItems(false)
    }
  }

  async function loadTraslados() {
    try {
      const url = !isDueno && sucursalId
        ? `/api/traslados?sucursal_id=${sucursalId}`
        : "/api/traslados"
      const res = await fetch(url)
      const data = await res.json()
      setTraslados(Array.isArray(data) ? data : data.traslados || [])
    } catch {
      setTraslados([])
    }
  }

  async function loadOrdenesPendientes() {
    try {
      const res = await fetch("/api/resumenes-cadete/ordenes-pendientes")
      const data = await res.json()
      setOrdenesPendientes(data || { retirar_de_taller: [], llevar_a_taller: [] })
    } catch {
      setOrdenesPendientes({ retirar_de_taller: [], llevar_a_taller: [] })
    }
  }

  async function handleSelectResumen(resumen) {
    setSelectedResumen(resumen)
    setError(null)
    await Promise.all([loadItems(resumen.id), loadTraslados(), loadOrdenesPendientes()])
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    const selectedCadeteId = newCadeteId
    try {
      const res = await fetch("/api/resumenes-cadete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadete_id: selectedCadeteId, nombre: newNombre || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const resumen = data.resumen
      setShowCreate(false)
      setNewCadeteId("")
      setNewNombre("")
      await loadData()
      // Go straight to item selection with the new resumen
      const cadete = cadetes.find((c) => c.id === selectedCadeteId)
      handleSelectResumen({
        ...resumen,
        cadete_username: cadete?.username || "—",
      })
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleToggleActivo(resumen) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${resumen.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !resumen.activo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadData()
      if (selectedResumen?.id === resumen.id) {
        setSelectedResumen({ ...resumen, activo: !resumen.activo })
      }
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeleteResumen(resumenId) {
    if (!confirm("¿Eliminar este resumen y todos sus items?")) return
    setError(null)
    try {
      const res = await fetch("/api/resumenes-cadete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumen_id: resumenId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      if (selectedResumen?.id === resumenId) {
        setSelectedResumen(null)
        setItems([])
      }
      await loadData()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleAddTraslado(trasladoId) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "traslado", traslado_id: trasladoId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await Promise.all([loadItems(selectedResumen.id), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleAddOrden(ordenId, subtipo) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "orden", orden_id: ordenId, subtipo }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await Promise.all([loadItems(selectedResumen.id), loadOrdenesPendientes(), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleAddAdHoc(e) {
    e.preventDefault()
    if (!adHocText.trim()) return
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "ad_hoc", descripcion: adHocText.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setAdHocText("")
      await Promise.all([loadItems(selectedResumen.id), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeleteItem(itemId) {
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await Promise.all([loadItems(selectedResumen.id), loadOrdenesPendientes(), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleConfirmItem(itemId) {
    if (!confirm("¿Confirmar que el cadete completo esta tarea? Esto actualizara el estado de la orden.")) return
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await Promise.all([loadItems(selectedResumen.id), loadOrdenesPendientes(), loadData()])
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleMoveItem(index, direction) {
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= items.length) return
    const itemA = items[index]
    const itemB = items[swapIndex]
    setError(null)
    try {
      const res = await fetch(`/api/resumenes-cadete/${selectedResumen.id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id_a: itemA.item_id,
          orden_a: itemB.orden,
          item_id_b: itemB.item_id,
          orden_b: itemA.orden,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await loadItems(selectedResumen.id)
    } catch (e) {
      setError(e.message)
    }
  }

  // Filter out already-added items
  const addedTrasladoIds = new Set(items.filter((i) => i.tipo === "traslado").map((i) => i.traslado_id))
  const availableTraslados = traslados.filter((t) => !addedTrasladoIds.has(t.id))
  const addedOrdenKeys = new Set(items.filter((i) => i.tipo === "orden").map((i) => `${i.orden_id}:${i.subtipo}`))
  const availableRetirar = (ordenesPendientes.retirar_de_taller || []).filter((o) => !addedOrdenKeys.has(`${o.id}:retirar_de_taller`))
  const availableLlevar = (ordenesPendientes.llevar_a_taller || []).filter((o) => !addedOrdenKeys.has(`${o.id}:llevar_a_taller`))

  function renderItemBadge(item) {
    if (item.tipo === "traslado") {
      return (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
          item.traslado_tipo === "ida" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
        }`}>
          {item.traslado_tipo === "ida" ? "LLEVAR" : "RETIRAR"}
        </span>
      )
    }
    if (item.tipo === "orden") {
      return (
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
          item.subtipo === "retirar_de_taller" ? "bg-teal-100 text-teal-700" : "bg-purple-100 text-purple-700"
        }`}>
          {item.subtipo === "retirar_de_taller" ? "RETIRAR TALLER" : "LLEVAR TALLER"}
        </span>
      )
    }
    return <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">TAREA</span>
  }

  function renderItemDetail(item) {
    if (item.tipo === "traslado") {
      return (
        <>
          <span className="text-sm text-slate-700 ml-2">
            {[item.tipo_articulo, item.marca, item.modelo].filter(Boolean).join(" — ")}
          </span>
          <span className="text-xs text-slate-500 ml-2">
            {item.sucursal_origen_nombre} → {item.sucursal_destino_nombre}
          </span>
        </>
      )
    }
    if (item.tipo === "orden") {
      return (
        <>
          <span className="text-sm text-slate-700 ml-2">
            #{String(item.numero_orden).padStart(4, "0")} — {[item.tipo_articulo, item.marca, item.modelo].filter(Boolean).join(" — ")}
          </span>
          <span className="text-xs text-slate-500 ml-2">
            {item.subtipo === "retirar_de_taller"
              ? `Retirar de ${item.orden_taller_nombre}`
              : `Llevar a ${item.orden_taller_nombre} (desde ${item.orden_sucursal_nombre})`}
          </span>
        </>
      )
    }
    return <span className="text-sm text-slate-700 ml-2">{item.descripcion}</span>
  }

  function renderOrdenCard(orden, subtipo) {
    const label = subtipo === "retirar_de_taller" ? "Retirar de" : "Llevar a"
    const tallerDisplay = orden.taller_nombre || "Sin taller asignado"
    return (
      <div key={orden.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-slate-200 text-sm">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold font-mono text-slate-900">#{String(orden.numero_orden).padStart(4, "0")}</span>
            <span className="text-slate-700">{[orden.tipo_articulo, orden.marca, orden.modelo].filter(Boolean).join(" — ")}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {orden.taller_nombre
              ? <>{label} <span className="font-semibold text-slate-600">{orden.taller_nombre}</span></>
              : <span className="text-amber-600 font-medium">Sin taller asignado</span>
            }
            <span className="mx-1">|</span>
            Ubicacion: {orden.sucursal_nombre}
            <span className="mx-1">|</span>
            {orden.dias_en_estado}d en estado
          </div>
        </div>
        <button
          onClick={() => handleAddOrden(orden.id, subtipo)}
          className="px-2.5 py-1 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex-shrink-0 ml-2"
        >+ Agregar</button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Resumenes de Cadete</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-slate-400">Cargando...</div>
          ) : selectedResumen ? (
            /* Item management view */
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => { setSelectedResumen(null); setItems([]) }}
                  className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  ← Volver a resumenes
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600"
                >
                  Guardar edicion
                </button>
              </div>

              <h3 className="text-sm font-bold text-slate-700 mb-4">
                {selectedResumen.nombre || "Sin nombre"} — {selectedResumen.cadete_username}
              </h3>

              {/* Current items list */}
              {loadingItems ? (
                <div className="text-center py-8 text-slate-400 text-sm">Cargando items...</div>
              ) : (
                <div className="space-y-2 mb-6">
                  {items.length === 0 && (
                    <p className="text-sm text-slate-400 py-4 text-center">Sin items. Selecciona ordenes, traslados o agrega tareas.</p>
                  )}
                  {items.map((item, idx) => (
                    <div key={item.item_id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => handleMoveItem(idx, -1)} disabled={idx === 0}
                          className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                        <button onClick={() => handleMoveItem(idx, 1)} disabled={idx === items.length - 1}
                          className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-1">
                          {renderItemBadge(item)}
                          {renderItemDetail(item)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.tipo === "orden" && (
                          <button onClick={() => handleConfirmItem(item.item_id)}
                            className="px-2.5 py-1 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium">
                            Confirmar
                          </button>
                        )}
                        <button onClick={() => handleDeleteItem(item.item_id)}
                          className="px-2.5 py-1 text-xs text-red-500 hover:text-red-700">Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* === CATEGORIZED ORDER SECTIONS === */}

              {/* Para retirar de taller */}
              {availableRetirar.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-teal-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                    Para retirar de taller ({availableRetirar.length})
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {availableRetirar.map((o) => renderOrdenCard(o, "retirar_de_taller"))}
                  </div>
                </div>
              )}

              {/* Para llevar a taller */}
              {availableLlevar.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    Listo para envio a taller ({availableLlevar.length})
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {availableLlevar.map((o) => renderOrdenCard(o, "llevar_a_taller"))}
                  </div>
                </div>
              )}

              {/* Traslados entre sucursales */}
              {availableTraslados.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Traslados entre sucursales ({availableTraslados.length})
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {availableTraslados.map((t) => (
                      <div key={t.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-slate-200 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              t.tipo === "ida" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                            }`}>
                              {t.tipo === "ida" ? "IDA" : "RETORNO"}
                            </span>
                            <span className="text-slate-700">
                              #{String(t.ordenes?.numero_orden).padStart(4, "0")} — {t.ordenes?.tipo_articulo} {t.ordenes?.marca || ""}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {t.sucursal_origen_rel?.nombre} → {t.sucursal_destino_rel?.nombre}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddTraslado(t.id)}
                          className="px-2.5 py-1 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 flex-shrink-0 ml-2"
                        >+ Agregar</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agregar tarea ad-hoc */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Agregar tarea manual
                </h4>
                <form onSubmit={handleAddAdHoc} className="flex gap-2">
                  <input
                    type="text"
                    value={adHocText}
                    onChange={(e) => setAdHocText(e.target.value)}
                    placeholder='Ej: "Retirar repuesto en Taller Lopez, Av. Italia 1234"'
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={!adHocText.trim()}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-40"
                  >Agregar</button>
                </form>
              </div>
            </div>
          ) : (
            /* Resumenes list view */
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">
                  {resumenes.length} {resumenes.length === 1 ? "resumen" : "resumenes"}
                </p>
                <button
                  onClick={() => { setShowCreate(true); setError(null) }}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600"
                >+ Nuevo resumen</button>
              </div>

              {showCreate && (
                <form onSubmit={handleCreate} className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Cadete</label>
                      <select
                        required
                        value={newCadeteId}
                        onChange={(e) => setNewCadeteId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="">Seleccionar cadete...</option>
                        {cadetes.map((c) => (
                          <option key={c.id} value={c.id}>{c.username}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Nombre (opcional)</label>
                      <input
                        type="text"
                        value={newNombre}
                        onChange={(e) => setNewNombre(e.target.value)}
                        placeholder="Ej: Ronda lunes tarde"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={!newCadeteId} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 disabled:opacity-40">Crear y seleccionar items</button>
                    <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancelar</button>
                  </div>
                </form>
              )}

              {resumenes.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No hay resumenes creados. Crea uno para asignar tareas a un cadete.
                </div>
              ) : (
                <div className="space-y-2">
                  {resumenes.map((r) => (
                    <div
                      key={r.id}
                      className={`bg-white rounded-xl border p-4 transition-colors ${
                        r.activo ? "border-slate-200" : "border-slate-100 opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleSelectResumen(r)}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{r.nombre || "Sin nombre"}</span>
                            {!r.activo && (
                              <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded">Inactivo</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Cadete: <span className="font-medium">{r.cadete_username}</span> — {r.item_count} items
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSelectResumen(r)}
                            className="px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium">Editar</button>
                          <button onClick={() => handleToggleActivo(r)}
                            className="px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                          >{r.activo ? "Desactivar" : "Activar"}</button>
                          <button onClick={() => handleDeleteResumen(r.id)}
                            className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 font-medium">Eliminar</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
