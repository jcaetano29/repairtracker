import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

/**
 * GET /api/admin/plantillas
 * Returns all WhatsApp message templates.
 * Requires authenticated session.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from("plantillas_whatsapp")
    .select("tipo, mensaje, updated_at")
    .order("tipo")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ plantillas: data })
}

/**
 * PATCH /api/admin/plantillas
 * Updates a single template message.
 * Requires admin role.
 *
 * Body: { tipo: string, mensaje: string }
 */
export async function PATCH(request) {
  const session = await auth()
  if (!session?.user?.role || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { tipo, mensaje } = body

  if (!tipo || typeof mensaje !== "string") {
    return NextResponse.json(
      { error: "tipo and mensaje are required" },
      { status: 400 }
    )
  }

  if (mensaje.trim().length === 0) {
    return NextResponse.json(
      { error: "mensaje cannot be empty" },
      { status: 400 }
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from("plantillas_whatsapp")
    .update({ mensaje, updated_at: new Date().toISOString() })
    .eq("tipo", tipo)
    .select()
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: `Template '${tipo}' not found` },
        { status: 404 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
