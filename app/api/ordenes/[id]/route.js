import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getOrden, deleteOrden, updateSucursalRetiro } from "@/lib/data"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request, { params }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  try {
    const orden = await getOrden(id)
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 })
    if (session.user.role !== "admin" && orden.sucursal_id !== session.user.sucursal_id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    return NextResponse.json({ orden })
  } catch (e) {
    console.error("[/api/ordenes/:id] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al obtener orden" }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  try {
    // Currently the only supported partial update is sucursal_retiro_id.
    if (body.sucursal_retiro_id !== undefined) {
      const data = await updateSucursalRetiro(id, body.sucursal_retiro_id)
      return NextResponse.json({ orden: data })
    }
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 })
  } catch (e) {
    console.error("[/api/ordenes/:id] PATCH error:", e)
    return NextResponse.json({ error: e.message || "Error al actualizar orden" }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin puede eliminar" }, { status: 403 })
  }

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  try {
    await deleteOrden(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/ordenes/:id] DELETE error:", e)
    return NextResponse.json({ error: e.message || "Error al eliminar orden" }, { status: 500 })
  }
}
