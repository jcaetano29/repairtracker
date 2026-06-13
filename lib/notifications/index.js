import { sendWhatsApp } from './whatsapp'
import { getSupabaseAdmin } from '../supabase-admin'

/**
 * Envía una notificación al cliente por WhatsApp.
 * Si el cliente no tiene `clienteTelefono`, no se envía nada (silencioso).
 * Si WhatsApp falla, se loguea el error pero no se propaga.
 *
 * @param {'PRESUPUESTO' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data — debe incluir `clienteTelefono` y las keys que el template necesita
 */
export async function sendNotification(type, data) {
  try {
    await sendViaWhatsApp(type, data)
  } catch (e) {
    console.error('[Notifications] canal whatsapp falló:', e)
  }
}

async function sendViaWhatsApp(type, data) {
  if (!data.clienteTelefono) return

  const { data: row, error } = await getSupabaseAdmin()
    .from('plantillas_whatsapp_meta')
    .select('template_name, language_code, param_keys')
    .eq('tipo', type)
    .single()

  if (error || !row) {
    console.warn('[Notifications] No Meta template mapping found for type:', type)
    return
  }

  const parameters = row.param_keys.map((key) => String(data[key] ?? ''))

  return await sendWhatsApp({
    to: data.clienteTelefono,
    templateName: row.template_name,
    languageCode: row.language_code,
    parameters,
  })
}
