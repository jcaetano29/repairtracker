import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

async function verifyAdmin() {
  const session = await auth()
  return session?.user?.role === "admin" ? session : null
}

// GET — list all sucursales
export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from("sucursales")
    .select("id, nombre, activo, created_at")
    .order("nombre")

  if (error) {
    console.error("[/api/admin/sucursales] GET error:", error)
    return NextResponse.json({ error: "Error al obtener sucursales" }, { status: 500 })
  }
  return NextResponse.json({ sucursales: data })
}

// POST — create sucursal
export async function POST(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { nombre } = body
  if (!nombre?.trim() || typeof nombre !== "string") {
    return NextResponse.json({ error: "nombre es requerido" }, { status: 400 })
  }
  if (nombre.trim().length > 100) {
    return NextResponse.json({ error: "nombre muy largo (máx 100 caracteres)" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("sucursales")
    .insert({ nombre: nombre.trim() })

  if (error) {
    console.error("[/api/admin/sucursales] POST error:", error)
    return NextResponse.json({ error: "Error al crear sucursal" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// PATCH — update nombre or activo
export async function PATCH(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { sucursalId, nombre, activo } = body
  if (!sucursalId) {
    return NextResponse.json({ error: "sucursalId es requerido" }, { status: 400 })
  }
  // Validate UUID format
  if (typeof sucursalId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sucursalId)) {
    return NextResponse.json({ error: "Formato de sucursalId inválido" }, { status: 400 })
  }

  const updates = {}
  if (nombre !== undefined) updates.nombre = nombre.trim()
  if (activo !== undefined) updates.activo = activo

  const { error } = await getSupabaseAdmin()
    .from("sucursales")
    .update(updates)
    .eq("id", sucursalId)

  if (error) {
    console.error("[/api/admin/sucursales] PATCH error:", error)
    return NextResponse.json({ error: "Error al actualizar sucursal" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
