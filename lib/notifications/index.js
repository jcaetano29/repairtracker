import { sendEmail } from './email'
import { sendWhatsApp } from './whatsapp'
import { getSupabaseAdmin } from '../supabase-admin'

/**
 * Interpola variables {{var}} en un template.
 * Variables desconocidas se dejan como están.
 */
export function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/**
 * Envía una notificación por todos los canales disponibles según `data`.
 * - Email si `data.clienteEmail`
 * - WhatsApp si `data.clienteTelefono`
 *
 * Los canales corren en paralelo y un fallo en uno no bloquea al otro.
 *
 * @param {'PRESUPUESTO' | 'LISTO_PARA_RETIRO' | 'RECORDATORIO_MANTENIMIENTO'} type
 * @param {object} data
 */
export async function sendNotification(type, data) {
  const results = await Promise.allSettled([
    sendViaEmail(type, data),
    sendViaWhatsApp(type, data),
  ])
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const canal = i === 0 ? 'email' : 'whatsapp'
      console.error(`[Notifications] canal ${canal} falló:`, r.reason)
    }
  })
}

async function sendViaEmail(type, data) {
  if (!data.clienteEmail) return

  const { data: row, error } = await getSupabaseAdmin()
    .from('plantillas_email')
    .select('asunto, cuerpo')
    .eq('tipo', type)
    .single()

  if (error || !row) {
    console.warn('[Notifications] No email template found for type:', type)
    return
  }

  const subject = interpolate(row.asunto, data)
  const body = interpolate(row.cuerpo, data)
  await sendEmail({ to: data.clienteEmail, subject, body })
}

async function sendViaWhatsApp(type, data) {
  if (!data.clienteTelefono) return

  const { data: row, error } = await getSupabaseAdmin()
    .from('plantillas_whatsapp')
    .select('mensaje')
    .eq('tipo', type)
    .single()

  if (error || !row) {
    console.warn('[Notifications] No whatsapp template found for type:', type)
    return
  }

  const body = interpolate(row.mensaje, data)
  await sendWhatsApp({ to: data.clienteTelefono, body })
}
