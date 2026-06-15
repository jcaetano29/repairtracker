import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { updateTipoServicio, deleteTipoServicio } from "@/lib/data"

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

  if (!body.nombre?.trim()) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 })
  if (!body.ciclo_meses) return NextResponse.json({ error: "ciclo_meses es requerido" }, { status: 400 })

  try {
    const tipo = await updateTipoServicio(id, { nombre: body.nombre.trim(), ciclo_meses: body.ciclo_meses })
    return NextResponse.json({ tipo })
  } catch (e) {
    console.error("[/api/admin/tipos-servicio/:id] PATCH error:", e)
    return NextResponse.json({ error: e.message || "Error al actualizar tipo de servicio" }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  try {
    await deleteTipoServicio(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/admin/tipos-servicio/:id] DELETE error:", e)
    return NextResponse.json({ error: e.message || "Error al eliminar tipo de servicio" }, { status: 500 })
  }
}
