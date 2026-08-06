// lib/notifications/index.js
import { sendWhatsApp } from './whatsapp'
import { getSupabaseAdmin } from '../supabase-admin'
import { normalizePhoneToE164 } from '../phone'

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

  const waMessageId = await sendWhatsApp({
    to: data.clienteTelefono,
    templateName: row.template_name,
    languageCode: row.language_code,
    parameters,
  })

  await logOutboundWhatsAppMessage(type, data, waMessageId)
}

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/**
 * Registra el mensaje saliente en el hilo de whatsapp_mensajes para que la
 * bandeja de /whatsapp muestre ambos lados de la conversación. Nunca debe
 * bloquear ni fallar el envío real — es contabilidad secundaria.
 */
async function logOutboundWhatsAppMessage(type, data, waMessageId) {
  try {
    const telefonoE164 = normalizePhoneToE164(data.clienteTelefono)
    if (!telefonoE164) return

    const supabase = getSupabaseAdmin()
    const { data: cliente } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefono_e164', telefonoE164)
      .maybeSingle()

    if (!cliente) return

    const { data: previewRow } = await supabase
      .from('plantillas_whatsapp')
      .select('mensaje')
      .eq('tipo', type)
      .single()
    const body = previewRow ? interpolate(previewRow.mensaje, data) : `[${type}]`

    const { data: conversacion, error: convError } = await supabase
      .from('whatsapp_conversaciones')
      .upsert(
        {
          cliente_id: cliente.id,
          telefono_e164: telefonoE164,
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 120),
        },
        { onConflict: 'cliente_id' }
      )
      .select('id')
      .single()

    if (convError || !conversacion) return

    const { error: insertError } = await supabase.from('whatsapp_mensajes').insert({
      conversacion_id: conversacion.id,
      direccion: 'saliente',
      wa_message_id: waMessageId,
      tipo: 'text',
      body,
      estado: 'enviado',
    })

    if (insertError) {
      console.error('[Notifications] Error inserting outbound whatsapp message:', insertError)
    }
  } catch (e) {
    console.error('[Notifications] Error logging outbound whatsapp message:', e?.message)
  }
}
