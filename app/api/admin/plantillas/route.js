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
  if (!session?.user?.role || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from("plantillas_whatsapp")
    .select("tipo, mensaje, updated_at")
    .order("tipo")

  if (error) {
    console.error("[/api/admin/plantillas] GET error:", error)
    return NextResponse.json({ error: "Error al obtener plantillas" }, { status: 500 })
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

  const ALLOWED_TIPOS = ["PRESUPUESTO", "LISTO_PARA_RETIRO", "RECORDATORIO_MANTENIMIENTO"]

  if (!tipo || typeof mensaje !== "string") {
    return NextResponse.json(
      { error: "tipo and mensaje are required" },
      { status: 400 }
    )
  }

  if (!ALLOWED_TIPOS.includes(tipo)) {
    return NextResponse.json(
      { error: "Tipo de plantilla no válido" },
      { status: 400 }
    )
  }

  if (mensaje.trim().length === 0) {
    return NextResponse.json(
      { error: "mensaje cannot be empty" },
      { status: 400 }
    )
  }

  if (mensaje.length > 2000) {
    return NextResponse.json(
      { error: "mensaje too long (max 2000 characters)" },
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
        { error: "Plantilla no encontrada" },
        { status: 404 }
      )
    }
    console.error("[/api/admin/plantillas] PATCH error:", error)
    return NextResponse.json({ error: "Error al actualizar plantilla" }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
