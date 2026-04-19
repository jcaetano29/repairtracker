import { auth } from "@/auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

async function verifyAdmin() {
  const session = await auth()
  return session?.user?.role === "admin" ? session : null
}

// GET — list all usuarios
export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id, username, role, sucursal_id, sucursales(nombre), created_at")
    .order("created_at")

  if (error) {
    console.error("[/api/admin/usuarios] GET error:", error)
    return NextResponse.json({ error: "Error al obtener usuarios" }, { status: 500 })
  }
  return NextResponse.json({ users: data })
}

// POST — create new usuario
export async function POST(request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { username, password, role, sucursal_id } = body
  if (!username || !password || !role) {
    return NextResponse.json({ error: "username, password and role are required" }, { status: 400 })
  }
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Invalid input types" }, { status: 400 })
  }
  // Validate username format: alphanumeric and underscores only, max 50 chars
  if (!/^[a-zA-Z0-9_]{1,50}$/.test(username)) {
    return NextResponse.json({ error: "Username must be alphanumeric (max 50 chars)" }, { status: 400 })
  }
  if (!["employee", "admin", "cadete"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }
  if ((role === "employee" || role === "cadete") && !sucursal_id) {
    return NextResponse.json({ error: "sucursal_id es requerido para employees y cadetes" }, { status: 400 })
  }
  if (password.length < 6 || password.length > 128) {
    return NextResponse.json({ error: "Password must be 6-128 characters" }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(password, 10)

  const { error } = await getSupabaseAdmin()
    .from("usuarios")
    .insert({ username, password_hash, role, sucursal_id: (role === "employee" || role === "cadete") ? sucursal_id : null })

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "El nombre de usuario ya existe" }, { status: 409 })
    }
    console.error("[/api/admin/usuarios] POST error:", error)
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE — remove usuario
export async function DELETE(request) {
  const session = await verifyAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { userId } = body
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })
  // Validate UUID format to prevent injection
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
  }

  if (userId === session.user.id) {
    return NextResponse.json({ error: "No podés eliminar tu propia cuenta" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("usuarios")
    .delete()
    .eq("id", userId)

  if (error) {
    console.error("[/api/admin/usuarios] DELETE error:", error)
    return NextResponse.json({ error: "Error al eliminar usuario" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// PATCH — update role
export async function PATCH(request) {
  const session = await verifyAdmin()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { userId, role, sucursal_id } = body
  if (!userId || !role) {
    return NextResponse.json({ error: "userId and role required" }, { status: 400 })
  }
  // Validate UUID format
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
  }
  if (userId === session.user.id) {
    return NextResponse.json({ error: "No podés cambiar tu propio rol" }, { status: 400 })
  }
  if (!["employee", "admin", "cadete"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from("usuarios")
    .update({ role, sucursal_id: (role === "employee" || role === "cadete") ? (sucursal_id ?? null) : null })
    .eq("id", userId)

  if (error) {
    console.error("[/api/admin/usuarios] PATCH error:", error)
    return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
