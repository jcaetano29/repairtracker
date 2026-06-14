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

  const payload = {
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
  };

  console.log("[WhatsApp] Enviando payload:", JSON.stringify(payload));

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const rawBody = await res.text();

  if (!res.ok) {
    console.error("[WhatsApp] Error al enviar:", {
      status: res.status,
      body: rawBody,
    });
    throw new Error(`WhatsApp API error ${res.status}`);
  }

  console.log("[WhatsApp] Respuesta OK:", rawBody);
  try {
    const data = JSON.parse(rawBody);
    return data.messages?.[0]?.id ?? null;
  } catch (e) {
    console.error("[WhatsApp] Respuesta no es JSON:", e.message);
    return null;
  }
}
