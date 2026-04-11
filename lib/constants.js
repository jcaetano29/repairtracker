// ============================================================
// Estados del workflow y configuración
// ============================================================

export const ESTADOS = {
  INGRESADO:            { label: "Ingresado",             color: "#6366f1", bg: "#eef2ff", icon: "📥" },
  EN_TALLER:            { label: "En Taller",             color: "#8b5cf6", bg: "#f5f3ff", icon: "🚚" },
  ESPERANDO_APROBACION: { label: "Esperando Aprobación",  color: "#f97316", bg: "#fff7ed", icon: "📞" },
  RECHAZADO:            { label: "Rechazado",             color: "#ef4444", bg: "#fef2f2", icon: "✗"  },
  EN_REPARACION:        { label: "En Reparación",         color: "#3b82f6", bg: "#eff6ff", icon: "🔧" },
  LISTO_EN_TALLER:      { label: "Listo en Taller",       color: "#14b8a6", bg: "#f0fdfa", icon: "✓"  },
  LISTO_PARA_RETIRO:    { label: "Listo para Retiro",     color: "#22c55e", bg: "#f0fdf4", icon: "🎉" },
  ENTREGADO:            { label: "Entregado",             color: "#64748b", bg: "#f8fafc", icon: "✅" },
};

// Transiciones permitidas
export const TRANSICIONES = {
  INGRESADO:            ["EN_TALLER", "ESPERANDO_APROBACION"],
  EN_TALLER:            ["ESPERANDO_APROBACION"],
  ESPERANDO_APROBACION: ["EN_REPARACION", "RECHAZADO"],
  RECHAZADO:            ["LISTO_PARA_RETIRO"],
  EN_REPARACION:        ["LISTO_EN_TALLER", "LISTO_PARA_RETIRO"],
  LISTO_EN_TALLER:      ["LISTO_PARA_RETIRO"],
  LISTO_PARA_RETIRO:    ["ENTREGADO"],
  ENTREGADO:            [],
};

export const TIPOS_ARTICULO = [
  "Reloj",
  "Cadena",
  "Anillo",
  "Pulsera",
  "Aros",
  "Collar",
  "Dije",
  "Otro",
];

/**
 * Determine delay level based on state, days in state, and thresholds
 * @param {string} estado - Order state (e.g., "INGRESADO", "EN_TALLER")
 * @param {number} diasEnEstado - Days the order has been in current state.
 *                                Calculated as: EXTRACT(DAY FROM NOW() - updated_at)
 *                                (where updated_at is when the order transitioned to the current state)
 * @param {object} umbrales - Thresholds object {umbral_estado: {leve, grave}, ...}
 *                           Loaded dynamically from configuracion table
 * @returns {string} - "none" (no delay), "leve" (warning), or "grave" (critical)
 */
export function getNivelRetraso(estado, diasEnEstado, umbrales) {
  if (!umbrales) return "none"

  const clave = `umbral_${estado.toLowerCase()}`
  const umbral = umbrales[clave]

  if (!umbral) return "none"
  if (umbral.grave > 0 && diasEnEstado >= umbral.grave) return "grave"
  if (umbral.leve > 0 && diasEnEstado >= umbral.leve) return "leve"
  return "none"
}

export function formatNumeroOrden(num) {
  return String(num).padStart(4, "0");
}

export function formatFecha(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatFechaHora(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleString("es-UY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
