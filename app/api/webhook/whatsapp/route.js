// app/api/webhook/whatsapp/route.js
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

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
 * POST — Meta status updates (sent, delivered, read, failed).
 * Always returns 200 — Meta retries on other status codes.
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const entries = body.entry ?? []

    for (const entry of entries) {
      const changes = entry.changes ?? []
      for (const change of changes) {
        const statuses = change.value?.statuses ?? []
        for (const status of statuses) {
          await processStatus(status)
        }
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
    updateData.error = status.errors?.[0]?.title ?? "Unknown error"
  }

  const { error } = await getSupabaseAdmin()
    .from("notificaciones_enviadas")
    .update(updateData)
    .eq("wa_message_id", status.id)

  if (error) {
    console.error("[Webhook WhatsApp] Error updating notification:", error)
  }
}
