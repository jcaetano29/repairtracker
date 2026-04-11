// lib/notifications/whatsapp.js

/**
 * Normaliza un número de teléfono al formato internacional sin + ni espacios.
 * Ej: "+54 9 11 1234-5678" → "5491112345678"
 */
function normalizePhone(raw) {
  return raw.replace(/\D/g, "");
}

/**
 * Envía un mensaje de WhatsApp via Meta Cloud API.
 * @param {string} to - Número del destinatario (cualquier formato, se normaliza)
 * @param {string} body - Texto del mensaje
 */
export async function sendWhatsApp({ to, body }) {
  if (!to) return;

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn("[WhatsApp] WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados");
    return;
  }

  const phone = normalizePhone(to);

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
        type: "text",
        text: { body },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[WhatsApp] Error al enviar:", err);
    throw new Error(err?.error?.message || `WhatsApp API error ${res.status}`);
  }
}
