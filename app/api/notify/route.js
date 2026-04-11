// app/api/notify/route.js
import { auth } from "@/auth"
import { sendNotification } from "@/lib/notifications"
import { NextResponse } from "next/server"

export async function POST(request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ALLOWED_TYPES = ["PRESUPUESTO", "LISTO_PARA_RETIRO", "RECORDATORIO_MANTENIMIENTO"]

  try {
    const body = await request.json()
    const { type, data } = body

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid notification type" }, { status: 400 })
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }

    await sendNotification(type, data)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[/api/notify]", error)
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 })
  }
}
