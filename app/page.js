"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { Badge } from "@/components/Badge"
import { StatCard } from "@/components/StatCard"
import { NuevoIngresoModal } from "@/components/NuevoIngresoModal"
import { DetalleOrdenModal } from "@/components/DetalleOrdenModal"
import { TrasladosBadge } from "@/components/TrasladosBadge"
import { TrasladosPanel } from "@/components/TrasladosPanel"
import { ResumenCadetePanel } from "@/components/ResumenCadetePanel"
import { ESTADOS, getNivelRetraso, formatNumeroOrden } from "@/lib/constants"
import { getOrdenes, getStats, getTalleres, getSucursales } from "@/lib/data"
import { formatMonto } from "@/lib/currency"
import { getConfiguracion } from "@/lib/data/configuracion"

export default function DashboardPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isDueno = session?.user?.role === "admin"

  const [ordenes, setOrdenes] = useState([])
  const [stats, setStatsState] = useState({ activas: 0, conRetraso: 0, listasRetiro: 0, enTaller: 0 })
  const [talleres, setTalleresState] = useState([])
  const [filtroEstado, setFiltroEstado] = useState("TODOS")
  const [filtroTaller, setFiltroTaller] = useState("TODOS")
  const [filtroSucursal, setFiltroSucursal] = useState("TODAS")
  const [sucursales, setSucursales] = useState([])
  const [busqueda, setBusqueda] = useState("")
  const [debouncedBusqueda, setDebouncedBusqueda] = useState("")
  const searchTimeoutRef = useRef(null)
  const [vista, setVista] = useState("kanban")
  const [showNuevo, setShowNuevo] = useState(false)
  const [selectedOrden, setSelectedOrden] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [totalOrdenes, setTotalOrdenes] = useState(0)
  const [umbrales, setUmbrales] = useState({})
  const [trasladosRefresh, setTrasladosRefresh] = useState(0)
  const [showResumenCadete, setShowResumenCadete] = useState(false)

  async function handleLogout() {
    await signOut({ callbackUrl: "/login" })
  }

  const loadData = useCallback(async () => {
    try {
      const sucursalFiltro = isDueno ? (filtroSucursal === "TODAS" ? undefined : filtroSucursal) : session?.user?.sucursal_id

      // Load configuracion first so we can pass it to getStats
      const configuracionData = await getConfiguracion()

      const [{ data: ordenesData, count: ordenesCount }, statsData, talleresData] = await Promise.all([
        getOrdenes({
          estado: filtroEstado,
          taller_id: filtroTaller,
          busqueda: debouncedBusqueda || undefined,
          incluirEntregados: filtroEstado === "ENTREGADO",
          sucursal_id: sucursalFiltro,
          page: pagina,
          limit: 20,
        }),
        getStats(configuracionData, { sucursal_id: sucursalFiltro }),
        getTalleres(),
      ])
      setOrdenes(ordenesData)
      setTotalOrdenes(ordenesCount)
      setStatsState(statsData)
      setTalleresState(talleresData)
      setUmbrales(configuracionData)
    } catch (e) {
      console.error("Error cargando datos:", e)
    } finally {
      setLoading(false)
    }
  }, [filtroEstado, filtroTaller, debouncedBusqueda, filtroSucursal, isDueno, session, pagina])

  useEffect(() => {
    if (isDueno) {
      getSucursales().then(setSucursales).catch(() => {})
    }
  }, [isDueno])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh cada 5 segundos
  useEffect(() => {
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [loadData])

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [])

  function handleSearch(value) {
    setBusqueda(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedBusqueda(value)
      setPagina(1)
    }, 400)
  }

  const estadosActivos = Object.entries(ESTADOS).filter(([k]) => k !== "ENTREGADO")

  function getPaginasVisibles(paginaActual, totalPaginas) {
    if (totalPaginas <= 7) return Array.from({ length: totalPaginas }, (_, i) => i + 1)
    const paginas = new Set([1, totalPaginas, paginaActual])
    if (paginaActual > 1) paginas.add(paginaActual - 1)
    if (paginaActual < totalPaginas) paginas.add(paginaActual + 1)
    const sorted = Array.from(paginas).sort((a, b) => a - b)
    const result = []
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("...")
      result.push(sorted[i])
    }
    return result
  }

  const totalPaginas = Math.ceil(totalOrdenes / 20)

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⌚</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">RepairTrack</h1>
              <p className="text-sm text-slate-500">Gestión de Reparaciones</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNuevo(true)}
              className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              + Nuevo Ingreso
            </button>
            <button
              onClick={() => setShowResumenCadete(true)}
              className="px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5"
            >
              🚚 Cadete
            </button>
            {isDueno && (
              <Link
                href="/admin"
                className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-5">
          <StatCard label="Activas" value={stats.activas} icon="📋" color="#0f172a" description="Órdenes en curso sin entregar" />
          <StatCard label="Con Retraso" value={stats.conRetraso} icon="⚠️" color="#ef4444" description="Superan el umbral de días en su estado" />
          <StatCard label="Para Retiro" value={stats.listasRetiro} icon="🎉" color="#22c55e" description="Listas para que el cliente retire" />
          <StatCard label="En Talleres" value={stats.enTaller} icon="🔧" color="#8b5cf6" description="Enviadas, en reparación o listas en taller" />
        </div>

        {/* Traslados Panel */}
        <TrasladosPanel
          sucursalId={isDueno ? (filtroSucursal === "TODAS" ? undefined : filtroSucursal) : session?.user?.sucursal_id}
          isDueno={isDueno}
          userSucursalId={session?.user?.sucursal_id}
          onAction={loadData}
          refreshSignal={trasladosRefresh}
        />

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="🔍 Buscar cliente, orden, marca..."
            value={busqueda}
            onChange={(e) => handleSearch(e.target.value)}
            className="px-3.5 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 w-64"
          />
          {isDueno && sucursales.length > 0 && (
            <select
              value={filtroSucursal}
              onChange={(e) => { setFiltroSucursal(e.target.value); setPagina(1) }}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-700"
            >
              <option value="TODAS">Todas las sucursales</option>
              {sucursales.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}
          <select
            value={filtroEstado}
            onChange={(e) => { setFiltroEstado(e.target.value); setPagina(1) }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer"
          >
            <option value="TODOS">Todos los estados</option>
            {Object.entries(ESTADOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </select>
          <select
            value={filtroTaller}
            onChange={(e) => { setFiltroTaller(e.target.value); setPagina(1) }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white cursor-pointer"
          >
            <option value="TODOS">Todos los talleres</option>
            <option value="LOCAL">En el local</option>
            {talleres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setVista("kanban")}
              className={`px-3 py-2.5 rounded-md text-xs font-medium border transition-colors ${
                vista === "kanban"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              Tablero
            </button>
            <button
              onClick={() => setVista("tabla")}
              className={`px-3 py-2.5 rounded-md text-xs font-medium border transition-colors ${
                vista === "tabla"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              Lista
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-slate-400">Cargando...</div>
        )}

        {/* Vista Tabla */}
        {!loading && vista === "tabla" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100">
                  {["Orden", "Cliente", "Artículo", "Estado", "Ubicación", "Monto", "Días", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-sm font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => {
                  const retraso = getNivelRetraso(o.estado, o.dias_en_estado, umbrales)
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrden(o)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors ${
                        retraso === "grave"
                          ? "bg-red-50 hover:bg-red-100/70"
                          : retraso === "leve"
                          ? "bg-amber-50 hover:bg-amber-100/50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-3 font-bold font-mono text-slate-900">
                        #{formatNumeroOrden(o.numero_orden)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{o.cliente_nombre}</div>
                        <div className="text-sm text-slate-500">{o.cliente_telefono}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{o.tipo_articulo}</div>
                        <div className="text-sm text-slate-500">{o.marca || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge estado={o.estado} />
                          {o.traslado_activo_id && (
                            <TrasladosBadge tipo={o.traslado_activo_tipo} estado={o.traslado_activo_estado} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {o.traslado_activo_id && o.traslado_activo_estado !== "recibido"
                          ? <span className="text-blue-600">🚚 {o.traslado_activo_estado === "pendiente" ? "Pendiente envío" : "En tránsito"}</span>
                          : o.taller_nombre
                            ? <span className="text-purple-600">📍 {o.taller_nombre}</span>
                            : <span className="text-slate-500">🏠 {o.sucursal_nombre}</span>
                        }
                      </td>
                      <td className="px-4 py-3 font-semibold font-mono text-sm">
                        {o.monto_presupuesto ? formatMonto(o.monto_presupuesto, o.moneda) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          {retraso === "grave" && <span>🔴</span>}
                          {retraso === "leve" && <span>⚠️</span>}
                          <span
                            className={`text-xs font-semibold ${
                              retraso === "grave"
                                ? "text-red-600"
                                : retraso === "leve"
                                ? "text-amber-600"
                                : "text-slate-400"
                            }`}
                          >
                            {o.dias_en_estado}d
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {ordenes.length === 0 && (
              <div className="py-16 text-center text-slate-400 text-sm">
                No se encontraron órdenes con estos filtros
              </div>
            )}
          </div>
        )}

        {/* Paginación */}
        {!loading && vista === "tabla" && totalPaginas > 1 && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>

              {getPaginasVisibles(pagina, totalPaginas).map((p, i) =>
                p === "..." ? (
                  <span key={`dots-${i}`} className="px-2 text-slate-400 text-xs">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPagina(p)}
                    className={`w-10 h-10 text-xs font-medium rounded-lg border transition-colors ${
                      p === pagina
                        ? "bg-slate-900 text-white border-slate-900"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente →
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Mostrando {(pagina - 1) * 20 + 1}–{Math.min(pagina * 20, totalOrdenes)} de {totalOrdenes} órdenes
            </p>
          </div>
        )}

        {/* Vista Kanban */}
        {!loading && vista === "kanban" && (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {estadosActivos.map(([estado, config]) => {
              const enEstado = ordenes.filter((o) => o.estado === estado)
              return (
                <div
                  key={estado}
                  className="flex-shrink-0 w-64 bg-white rounded-xl border border-slate-200 flex flex-col max-h-[calc(100vh-220px)]"
                >
                  <div
                    className="px-3.5 py-3 flex items-center gap-2 border-b-2"
                    style={{ borderBottomColor: config.color }}
                  >
                    <span>{config.icon}</span>
                    <span className="text-xs font-bold text-slate-900 truncate">{config.label}</span>
                    <span
                      className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: config.bg, color: config.color }}
                    >
                      {enEstado.length}
                    </span>
                  </div>
                  <div className="p-2 space-y-1.5 overflow-y-auto flex-1">
                    {enEstado.map((o) => {
                      const retraso = getNivelRetraso(o.estado, o.dias_en_estado, umbrales)
                      return (
                        <div
                          key={o.id}
                          onClick={() => setSelectedOrden(o)}
                          className={`p-2.5 rounded-lg cursor-pointer transition-colors ${
                            retraso === "grave"
                              ? "border-2 border-red-300 bg-red-50"
                              : retraso === "leve"
                              ? "border-2 border-amber-300 bg-amber-50"
                              : "border border-slate-200 bg-slate-50 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold font-mono text-slate-900">
                              #{formatNumeroOrden(o.numero_orden)}
                            </span>
                            <span className="text-xs text-slate-500">{o.dias_en_estado}d</span>
                          </div>
                          <div className="text-xs font-semibold text-slate-700">{o.cliente_nombre}</div>
                          <div className="text-sm text-slate-600">
                            {o.tipo_articulo} — {o.marca || "S/M"}
                          </div>
                          <div className="text-xs mt-1">
                            {o.traslado_activo_id && o.traslado_activo_estado !== "recibido"
                              ? <span className="text-blue-600">🚚 {o.traslado_activo_estado === "pendiente" ? "Pendiente envío" : "En tránsito"}</span>
                              : o.taller_nombre
                                ? <span className="text-purple-600">📍 {o.taller_nombre}</span>
                                : <span className="text-slate-500">🏠 {o.sucursal_nombre}</span>
                            }
                          </div>
                          {retraso !== "none" && (
                            <div className="text-xs mt-1">
                              {retraso === "grave" ? "🔴 Retraso grave" : "⚠️ Retraso"}
                            </div>
                          )}
                          {o.traslado_activo_id && (
                            <div className="mt-1">
                              <TrasladosBadge tipo={o.traslado_activo_tipo} estado={o.traslado_activo_estado} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {enEstado.length === 0 && (
                      <div className="py-8 text-center text-xs text-slate-400">Sin órdenes</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      {showNuevo && (
        <NuevoIngresoModal
          onClose={() => setShowNuevo(false)}
          onCreated={() => { loadData(); setTrasladosRefresh((n) => n + 1); }}
        />
      )}
      {selectedOrden && (
        <DetalleOrdenModal
          orden={selectedOrden}
          onClose={() => setSelectedOrden(null)}
          onUpdated={() => loadData()}
          isDueno={isDueno}
          umbrales={umbrales}
        />
      )}
      {showResumenCadete && (
        <ResumenCadetePanel onClose={() => setShowResumenCadete(false)} />
      )}
    </div>
  )
}
