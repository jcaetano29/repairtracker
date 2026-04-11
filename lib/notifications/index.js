// Channel-agnostic notification abstraction.
// To add more channels: import them here and dispatch accordingly.

import { sendWhatsApp } from "./whatsapp";
import { ordenCreadaTemplate } from "./templates/orden-creada";
import { listoParaRetiroTemplate } from "./templates/listo-para-retiro";
import { recordatorioMantenimientoTemplate } from "./templates/recordatorio-mantenimiento";

/**
 * Send a notification to a client via WhatsApp.
 *
 * @param {'ORDEN_CREADA' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data - Template-specific payload. Must include clienteTelefono.
 */
export async function sendNotification(type, data) {
  if (!data.clienteTelefono) return; // no phone on record, skip silently

  let template;

  switch (type) {
    case "ORDEN_CREADA":
      template = ordenCreadaTemplate(data);
      break;
    case "LISTO_PARA_RETIRO":
      template = listoParaRetiroTemplate(data);
      break;
    case "RECORDATORIO_MANTENIMIENTO":
      template = recordatorioMantenimientoTemplate(data);
      break;
    default:
      console.warn("[Notifications] Unknown type:", type);
      return;
  }

  await sendWhatsApp({ to: data.clienteTelefono, body: template.body });
}
