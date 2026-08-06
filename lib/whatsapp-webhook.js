import crypto from "node:crypto";

/**
 * Valida la firma HMAC-SHA256 que Meta manda en X-Hub-Signature-256
 * para cada POST del webhook.
 */
export function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Aplana el payload del webhook de Meta a los mensajes entrantes que trae,
 * ignorando entries que solo traen "statuses" (confirmaciones de entrega/lectura).
 */
export function extractIncomingMessages(payload) {
  const results = [];
  const entries = payload?.entry ?? [];

  for (const entry of entries) {
    const changes = entry?.changes ?? [];
    for (const change of changes) {
      const messages = change?.value?.messages ?? [];
      for (const msg of messages) {
        if (!msg?.id || !msg?.from) continue;
        const isText = msg.type === "text";
        results.push({
          waId: msg.from,
          waMessageId: msg.id,
          type: isText ? "text" : "other",
          body: isText ? (msg.text?.body ?? null) : null,
        });
      }
    }
  }

  return results;
}
