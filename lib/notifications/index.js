// Channel-agnostic notification abstraction.
// To add WhatsApp: create lib/notifications/whatsapp.js and dispatch here.

import { sendEmail } from "./email";
import { ordenCreadaTemplate } from "./templates/orden-creada";
import { listoParaRetiroTemplate } from "./templates/listo-para-retiro";
import { recordatorioMantenimientoTemplate } from "./templates/recordatorio-mantenimiento";

/**
 * Send a notification to a client.
 *
 * @param {'ORDEN_CREADA' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data - Template-specific payload
 */
export async function sendNotification(type, data) {
  if (!data.clienteEmail) return; // no email on record, skip silently

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

  await sendEmail({ to: data.clienteEmail, ...template });
}
