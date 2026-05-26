// lib/notifications/whatsapp.js

/**
 * Normaliza un número de teléfono al formato internacional sin + ni espacios.
 * Ej: "+54 9 11 1234-5678" → "5491112345678"
 */
function normalizePhone(raw) {
  return raw.replace(/\D/g, "");
}

/**
 * Envía un mensaje de WhatsApp via Meta Cloud API usando Message Templates.
 * @param {object} opts
 * @param {string} opts.to - Número del destinatario (cualquier formato, se normaliza)
 * @param {string} opts.templateName - Nombre del template en Meta Business Manager
 * @param {string} opts.languageCode - Código de idioma (ej: "es_AR")
 * @param {string[]} opts.parameters - Parámetros posicionales del template body
 * @returns {Promise<string|null>} wa_message_id o null si no se envió
 */
export async function sendWhatsApp({ to, templateName, languageCode, parameters }) {
  if (!to) return null;

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn("[WhatsApp] WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados");
    return null;
  }

  const phone = normalizePhone(to);

  if (phone.length < 10) {
    console.warn("[WhatsApp] Número inválido (< 10 dígitos):", phone.length, "dígitos");
    return null;
  }

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [{
            type: "body",
            parameters: parameters.map((text) => ({ type: "text", text })),
          }],
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[WhatsApp] Error al enviar:", {
      status: res.status,
      errorCode: err?.error?.code,
    });
    throw new Error(`WhatsApp API error ${res.status}`);
  }

  const data = await res.json();
  return data.messages?.[0]?.id ?? null;
}
