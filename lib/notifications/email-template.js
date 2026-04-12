// lib/notifications/email-template.js

const BUSINESS_NAME = 'Riviera Joyas'
const BUSINESS_EMAIL = 'info@rivierajoyas.com.uy'

/**
 * Escapa caracteres HTML para prevenir inyección.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Renderiza un email HTML con el cuerpo del admin envuelto en branding.
 * @param {{ body: string }} params
 * @returns {string} HTML completo del email
 */
export function renderEmailHtml({ body }) {
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BUSINESS_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1f2937;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:0.5px;">${BUSINESS_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:#1f2937;">
              ${safeBody}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
              ${BUSINESS_NAME} · ${BUSINESS_EMAIL}<br>
              Este es un email automático, por favor no responder.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
