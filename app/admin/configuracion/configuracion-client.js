"use client"

import { useState } from "react"
import { toast } from "@/lib/toast"
import { ESTADOS } from "@/lib/constants"

/**
 * Estado display order (order from Task 6 spec)
 */
const ESTADO_ORDER = [
  "INGRESADO",
  "EN_TALLER",
  "ESPERANDO_APROBACION",
  "RECHAZADO",
  "EN_REPARACION",
  "LISTO_EN_TALLER",
  "LISTO_PARA_RETIRO",
  "ENTREGADO",
]

/**
 * ConfiguracionClient Component
 *
 * Renders a table of configuration thresholds for each order state.
 * Users can edit leve/grave values and save them to the API.
 *
 * @param {Object} configuracion - Configuration object mapping clave to {leve, grave}
 */
export default function ConfiguracionClient({ configuracion }) {
  // Track local state for each threshold row: { umbral_key: { leve, grave, loading } }
  const [rows, setRows] = useState(() => {
    const initial = {}
    ESTADO_ORDER.forEach((estado) => {
      const clave = `umbral_${estado.toLowerCase()}`
      const valor = configuracion[clave] || { leve: 0, grave: 0 }
      initial[clave] = {
        leve: valor.leve,
        grave: valor.grave,
        loading: false,
      }
    })
    return initial
  })

  /**
   * Handle input change for a row
   */
  function handleInputChange(clave, field, value) {
    const numValue = value === "" ? "" : parseInt(value, 10)
    setRows((prev) => ({
      ...prev,
      [clave]: {
        ...prev[clave],
        [field]: isNaN(numValue) ? "" : numValue,
      },
    }))
  }

  /**
   * Check if a row's values are valid for saving
   * Rules: leve and grave must be numbers, leve < grave when grave > 0
   */
  function isRowValid(clave) {
    const row = rows[clave]
    if (row.leve === "" || row.grave === "") return false
    if (typeof row.leve !== "number" || typeof row.grave !== "number") {
      return false
    }
    if (row.grave > 0 && row.leve >= row.grave) return false
    return true
  }

  /**
   * Handle save for a single row
   */
  async function handleSave(clave) {
    if (!isRowValid(clave)) return

    const row = rows[clave]

    // Mark as loading
    setRows((prev) => ({
      ...prev,
      [clave]: { ...prev[clave], loading: true },
    }))

    try {
      const response = await fetch("/api/configuracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clave,
          valor: { leve: row.leve, grave: row.grave },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al guardar")
      }

      // Update row with server response if available
      if (data.data?.valor) {
        setRows((prev) => ({
          ...prev,
          [clave]: {
            leve: data.data.valor.leve,
            grave: data.data.valor.grave,
            loading: false,
          },
        }))
      } else {
        setRows((prev) => ({
          ...prev,
          [clave]: { ...prev[clave], loading: false },
        }))
      }

      toast.success("Umbral actualizado")
    } catch (error) {
      toast.error(error.message)
      setRows((prev) => ({
        ...prev,
        [clave]: { ...prev[clave], loading: false },
      }))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Configuración de Umbrales de Retraso
        </h2>
        <p className="text-sm text-slate-600">
          Define los umbrales de días para alertas de retraso (leve y grave) en cada estado de orden.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">
                Umbral Leve (días)
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">
                Umbral Grave (días)
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {ESTADO_ORDER.map((estado, index) => {
              const clave = `umbral_${estado.toLowerCase()}`
              const row = rows[clave]
              const isValid = isRowValid(clave)

              return (
                <tr
                  key={clave}
                  className={`border-b border-slate-100 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-50"
                  }`}
                >
                  {/* Estado column */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {ESTADOS[estado]?.icon || ""}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {ESTADOS[estado]?.label || estado}
                      </span>
                    </div>
                  </td>

                  {/* Umbral Leve column */}
                  <td className="px-4 py-4 text-center">
                    <input
                      type="number"
                      min="0"
                      value={row.leve === "" ? "" : row.leve}
                      onChange={(e) =>
                        handleInputChange(clave, "leve", e.target.value)
                      }
                      disabled={row.loading}
                      className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>

                  {/* Umbral Grave column */}
                  <td className="px-4 py-4 text-center">
                    <input
                      type="number"
                      min="0"
                      value={row.grave === "" ? "" : row.grave}
                      onChange={(e) =>
                        handleInputChange(clave, "grave", e.target.value)
                      }
                      disabled={row.loading}
                      className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>

                  {/* Acción column */}
                  <td className="px-4 py-4 text-center">
                    <button
                      onClick={() => handleSave(clave)}
                      disabled={!isValid || row.loading}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        isValid && !row.loading
                          ? "bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer"
                          : "bg-slate-200 text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      {row.loading ? "Guardando..." : "Guardar"}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
        <p className="text-xs text-blue-900">
          <strong>Cómo funciona:</strong> Los umbrales definen la cantidad de días que una orden puede permanecer en un estado antes de generar una alerta.
        </p>
        <p className="text-xs text-blue-900">
          • Si una orden lleva <strong>≥ Umbral Leve</strong> días en el estado → Se marca con ⚠️ (alerta leve)<br/>
          • Si una orden lleva <strong>≥ Umbral Grave</strong> días en el estado → Se marca con 🔴 (alerta grave)
        </p>
        <p className="text-xs text-blue-900 opacity-75">
          Los días se cuentan desde la última transición de estado (cuando la orden entró al estado actual).
        </p>
      </div>
    </div>
  )
}
