// lib/notifications/email.js
import { Resend } from 'resend'
import { renderEmailHtml } from './email-template'

const FROM = 'Riviera Joyas <info@rivierajoyas.com.uy>'

/**
 * Envía un email transaccional vía Resend.
 * @param {{ to: string, subject: string, body: string }} params
 */
export async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY no configurado')
    return
  }
  if (!to) return

  const html = renderEmailHtml({ body })
  const resend = new Resend(apiKey)

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    text: body,
  })

  if (error) {
    console.error('[Email] Error al enviar:', {
      name: error.name,
      statusCode: error.statusCode,
    })
    throw new Error(`Resend error: ${error.name}`)
  }
}
