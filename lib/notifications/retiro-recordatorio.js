// lib/notifications/retiro-recordatorio.js
import { getNivelRetraso } from "../constants";

/**
 * Decide si una orden amerita el recordatorio manual de retiro.
 *
 * La regla combina dos condiciones:
 *  1. la orden sigue en LISTO_PARA_RETIRO (si la hubieran retirado estaría ENTREGADO), y
 *  2. el retiro está demorado según `umbral_listo_para_retiro` (nivel leve o grave).
 *
 * @param {object} orden
 * @param {string} orden.estado
 * @param {number} orden.diasEnEstado - días en el estado actual (v_ordenes_dashboard.dias_en_estado)
 * @param {object} umbrales - configuración { umbral_listo_para_retiro: { leve, grave }, ... }
 * @returns {boolean}
 */
export function recordatorioRetiroDisponible({ estado, diasEnEstado }, umbrales) {
  if (estado !== "LISTO_PARA_RETIRO") return false;
  if (getNivelRetraso("LISTO_PARA_RETIRO", diasEnEstado, umbrales) === "none") return false;
  return true;
}
