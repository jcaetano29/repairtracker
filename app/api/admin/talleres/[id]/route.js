import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { updateTaller, deleteTaller } from "@/lib/data"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyAdmin() {
  const session = await auth()
  return session?.user?.role === "admin" ? session : null
}

export async function PATCH(request, { params }) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  try {
    const taller = await updateTaller(id, body)
    return NextResponse.json({ taller })
  } catch (e) {
    console.error("[/api/admin/talleres/:id] PATCH error:", e)
    return NextResponse.json({ error: e.message || "Error al actualizar taller" }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  try {
    await deleteTaller(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/admin/talleres/:id] DELETE error:", e)
    return NextResponse.json({ error: e.message || "Error al eliminar taller" }, { status: 500 })
  }
}
