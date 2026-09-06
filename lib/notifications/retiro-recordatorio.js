// lib/notifications/retiro-recordatorio.js
import { getNivelRetraso } from "../constants";

/**
 * Decide si una orden amerita el recordatorio manual de retiro.
 *
 * La regla combina las tres condiciones acordadas:
 *  1. la orden sigue en LISTO_PARA_RETIRO (si la hubieran retirado estaría ENTREGADO),
 *  2. el retiro está demorado según `umbral_listo_para_retiro` (nivel leve o grave), y
 *  3. el cliente no respondió desde que la orden quedó lista.
 *
 * @param {object} orden
 * @param {string} orden.estado
 * @param {number} orden.diasEnEstado - días en el estado actual (v_ordenes_dashboard.dias_en_estado)
 * @param {string} orden.updatedAt - ISO; momento en que entró a LISTO_PARA_RETIRO
 * @param {string|null} orden.lastIncomingMessageAt - ISO del último mensaje entrante, o null
 * @param {object} umbrales - configuración { umbral_listo_para_retiro: { leve, grave }, ... }
 * @returns {boolean}
 */
export function recordatorioRetiroDisponible(
  { estado, diasEnEstado, updatedAt, lastIncomingMessageAt },
  umbrales
) {
  if (estado !== "LISTO_PARA_RETIRO") return false;
  if (getNivelRetraso("LISTO_PARA_RETIRO", diasEnEstado, umbrales) === "none") return false;
  // "No respondió": no hay mensaje entrante posterior al momento en que quedó lista.
  if (lastIncomingMessageAt && new Date(lastIncomingMessageAt) >= new Date(updatedAt)) return false;
  return true;
}
