// app/api/webhook/whatsapp/route.js
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { normalizePhoneToE164 } from "@/lib/phone"
import { verifyWebhookSignature, extractIncomingMessages } from "@/lib/whatsapp-webhook"

export const runtime = "nodejs"

/**
 * GET — Meta webhook verification.
 * Meta sends hub.mode, hub.verify_token, hub.challenge as query params.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

/**
 * POST — Meta status updates (sent, delivered, read, failed) and incoming
 * client messages. Always returns 200 — Meta retries on other status codes.
 */
export async function POST(request) {
  const rawBody = await request.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET

  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256")
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  } else {
    console.warn("[Webhook WhatsApp] WHATSAPP_APP_SECRET no configurado — firma no verificada")
  }

  try {
    const body = JSON.parse(rawBody)
    console.log("[Webhook WhatsApp] Payload recibido:", JSON.stringify(body))
    const entries = body.entry ?? []

    for (const entry of entries) {
      const changes = entry.changes ?? []
      for (const change of changes) {
        const statuses = change.value?.statuses ?? []
        for (const status of statuses) {
          console.log("[Webhook WhatsApp] Status:", JSON.stringify(status))
          await processStatus(status)
        }
      }
    }

    const messages = extractIncomingMessages(body)
    for (const msg of messages) {
      try {
        await persistIncomingMessage(msg)
      } catch (e) {
        console.error("[Webhook WhatsApp] Error procesando mensaje entrante:", e?.message)
      }
    }
  } catch (e) {
    console.error("[Webhook WhatsApp] Error processing payload:", e)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}

const STATUS_MAP = {
  sent: { estado: "sent", enviado: true },
  delivered: { estado: "delivered", enviado: true },
  read: { estado: "read", enviado: true },
  failed: { estado: "failed", enviado: false },
}

async function processStatus(status) {
  const mapping = STATUS_MAP[status.status]
  if (!mapping) return

  const updateData = { ...mapping }

  if (status.status === "failed") {
    const err = status.errors?.[0]
    updateData.error = err?.title ?? "Unknown error"
    console.error(`[WHATSAPP_DELIVERY_FAILED] code=${err?.code} title="${err?.title}" message="${err?.message}" details="${err?.error_data?.details}"`)
  }

  const { error } = await getSupabaseAdmin()
    .from("notificaciones_enviadas")
    .update(updateData)
    .eq("wa_message_id", status.id)

  if (error) {
    console.error("[Webhook WhatsApp] Error updating notification:", error)
  }
}

async function persistIncomingMessage(msg) {
  const telefonoE164 = normalizePhoneToE164(msg.waId)
  if (!telefonoE164) return

  const supabase = getSupabaseAdmin()
  const { data: cliente, error: clienteError } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefono_e164", telefonoE164)
    .maybeSingle()

  if (clienteError) {
    console.error("[Webhook WhatsApp] Error buscando cliente:", clienteError.message)
    return
  }

  if (!cliente) return // Número desconocido — se descarta.

  const { data: conversacion, error: convError } = await supabase
    .from("whatsapp_conversaciones")
    .upsert(
      {
        cliente_id: cliente.id,
        telefono_e164: telefonoE164,
        last_message_at: new Date().toISOString(),
        last_message_preview: msg.type === "text" ? (msg.body?.slice(0, 120) ?? "") : "📎 Mensaje multimedia",
      },
      { onConflict: "cliente_id" }
    )
    .select("id")
    .single()

  if (convError) {
    console.error("[Webhook WhatsApp] Error actualizando conversación:", convError.message)
    return
  }

  if (!conversacion) return

  const { error: insertError } = await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: conversacion.id,
    direccion: "entrante",
    wa_message_id: msg.waMessageId,
    tipo: msg.type,
    body: msg.body,
  })

  // 23505 = unique_violation en wa_message_id — Meta reintentó un webhook ya procesado.
  if (insertError && insertError.code !== "23505") {
    console.error("[Webhook WhatsApp] Error insertando mensaje:", insertError.message)
  }
}
