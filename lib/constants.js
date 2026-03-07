// ============================================================
// Estados del workflow y configuración
// ============================================================

export const ESTADOS = {
  INGRESADO:              { label: "Ingresado",              color: "#6366f1", bg: "#eef2ff", icon: "📥", orden: 1 },
  ESPERANDO_PRESUPUESTO:  { label: "Esperando Presupuesto",  color: "#f59e0b", bg: "#fffbeb", icon: "⏳", orden: 2 },
  ENVIADO_A_TALLER:       { label: "Enviado a Taller",       color: "#8b5cf6", bg: "#f5f3ff", icon: "🚚", orden: 3 },
  PRESUPUESTO_RECIBIDO:   { label: "Presupuesto Recibido",   color: "#06b6d4", bg: "#ecfeff", icon: "💰", orden: 4 },
  ESPERANDO_APROBACION:   { label: "Esperando Aprobación",   color: "#f97316", bg: "#fff7ed", icon: "📞", orden: 5 },
  RECHAZADO:              { label: "Rechazado",              color: "#ef4444", bg: "#fef2f2", icon: "✗",  orden: 6 },
  EN_REPARACION:          { label: "En Reparación",          color: "#3b82f6", bg: "#eff6ff", icon: "🔧", orden: 7 },
  LISTO_EN_TALLER:        { label: "Listo en Taller",        color: "#14b8a6", bg: "#f0fdfa", icon: "✓",  orden: 8 },
  RETIRADO_POR_CADETE:    { label: "Retirado por Cadete",    color: "#a855f7", bg: "#faf5ff", icon: "🚴", orden: 9 },
  LISTO_PARA_RETIRO:      { label: "Listo para Retiro",      color: "#22c55e", bg: "#f0fdf4", icon: "🎉", orden: 10 },
  ENTREGADO:              { label: "Entregado",              color: "#64748b", bg: "#f8fafc", icon: "✅", orden: 11 },
};

// Transiciones permitidas
export const TRANSICIONES = {
  INGRESADO:             ["ESPERANDO_PRESUPUESTO", "ENVIADO_A_TALLER", "LISTO_PARA_RETIRO"],
  ESPERANDO_PRESUPUESTO: ["ENVIADO_A_TALLER", "ESPERANDO_APROBACION"],
  ENVIADO_A_TALLER:      ["PRESUPUESTO_RECIBIDO"],
  PRESUPUESTO_RECIBIDO:  ["ESPERANDO_APROBACION"],
  ESPERANDO_APROBACION:  ["EN_REPARACION", "RECHAZADO"],
  RECHAZADO:             ["LISTO_PARA_RETIRO"],
  EN_REPARACION:         ["LISTO_EN_TALLER", "LISTO_PARA_RETIRO"],
  LISTO_EN_TALLER:       ["RETIRADO_POR_CADETE"],
  RETIRADO_POR_CADETE:   ["LISTO_PARA_RETIRO"],
  LISTO_PARA_RETIRO:     ["ENTREGADO"],
  ENTREGADO:             [],
};

// Umbrales de retraso (en días)
export const UMBRALES_RETRASO = {
  INGRESADO:              { leve: 2, grave: 5 },
  ESPERANDO_PRESUPUESTO:  { leve: 3, grave: 6 },
  ENVIADO_A_TALLER:       { leve: 5, grave: 10 },
  ESPERANDO_APROBACION:   { leve: 2, grave: 4 },
  EN_REPARACION:          { leve: 15, grave: 30 },
  LISTO_PARA_RETIRO:      { leve: 5, grave: 10 },
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

export function getNivelRetraso(estado, diasEnEstado) {
  const umbral = UMBRALES_RETRASO[estado];
  if (!umbral) return "none";
  if (diasEnEstado >= umbral.grave) return "grave";
  if (diasEnEstado >= umbral.leve) return "leve";
  return "none";
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
