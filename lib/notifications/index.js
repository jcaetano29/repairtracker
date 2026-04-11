import { sendWhatsApp } from "./whatsapp";
import { getSupabaseAdmin } from "../supabase-admin";

/**
 * Interpola variables {{var}} en un template.
 * Variables desconocidas se dejan como están.
 */
export function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Envía una notificación WhatsApp usando una plantilla de la DB.
 *
 * @param {'PRESUPUESTO' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data - Variables para interpolar. Debe incluir clienteTelefono.
 */
export async function sendNotification(type, data) {
  if (!data.clienteTelefono) return;

  const { data: row, error } = await getSupabaseAdmin()
    .from("plantillas_whatsapp")
    .select("mensaje")
    .eq("tipo", type)
    .single();

  if (error || !row) {
    console.warn("[Notifications] No template found for type:", type);
    return;
  }

  const body = interpolate(row.mensaje, data);
  await sendWhatsApp({ to: data.clienteTelefono, body });
}
