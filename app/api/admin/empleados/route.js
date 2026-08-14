import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

async function verifyAdmin() {
  const session = await auth()
  return session?.user?.role === "admin" ? session : null
}

// GET — list empleados, optionally filtered by sucursal_id
export async function GET(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const sucursalId = searchParams.get("sucursal_id")

  let query = getSupabaseAdmin()
    .from("empleados")
    .select("id, sucursal_id, nombre, activo, created_at")
    .order("nombre")

  if (sucursalId) {
    query = query.eq("sucursal_id", sucursalId)
  }

  const { data, error } = await query

  if (error) {
    console.error("[/api/admin/empleados] GET error:", error)
    return NextResponse.json({ error: "Error al obtener empleados" }, { status: 500 })
  }
  return NextResponse.json({ empleados: data })
}

// POST — create empleado
export async function POST(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { sucursal_id, nombre } = body
  if (!sucursal_id || typeof sucursal_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sucursal_id)) {
    return NextResponse.json({ error: "sucursal_id inválido" }, { status: 400 })
  }
  if (!nombre?.trim() || typeof nombre !== "string") {
    return NextResponse.json({ error: "nombre es requerido" }, { status: 400 })
  }
  if (nombre.trim().length > 100) {
    return NextResponse.json({ error: "nombre muy largo (máx 100 caracteres)" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("empleados")
    .insert({ sucursal_id, nombre: nombre.trim() })

  if (error) {
    console.error("[/api/admin/empleados] POST error:", error)
    return NextResponse.json({ error: "Error al crear empleado" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// PATCH — toggle activo
export async function PATCH(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { empleadoId, activo } = body
  if (!empleadoId) {
    return NextResponse.json({ error: "empleadoId es requerido" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("empleados")
    .update({ activo })
    .eq("id", empleadoId)

  if (error) {
    console.error("[/api/admin/empleados] PATCH error:", error)
    return NextResponse.json({ error: "Error al actualizar empleado" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
