// app/api/resumenes-cadete/[id]/items/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getItemsResumen, addItemTraslado, addItemAdHoc, deleteItem, swapItemOrder } from "@/lib/cadete"

async function verifyStaff() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role === "admin" || session.user.role === "employee") return session
  return null
}

export async function GET(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  try {
    const items = await getItemsResumen(id)
    return NextResponse.json({ items })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] GET error:", e)
    return NextResponse.json({ error: "Error al obtener items" }, { status: 500 })
  }
}

export async function POST(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { tipo, traslado_id, descripcion } = body

  if (tipo === "traslado" && !traslado_id) {
    return NextResponse.json({ error: "traslado_id es requerido para tipo traslado" }, { status: 400 })
  }
  if (tipo === "ad_hoc" && !descripcion) {
    return NextResponse.json({ error: "descripcion es requerida para tipo ad_hoc" }, { status: 400 })
  }
  if (!["traslado", "ad_hoc"].includes(tipo)) {
    return NextResponse.json({ error: "tipo must be 'traslado' or 'ad_hoc'" }, { status: 400 })
  }

  try {
    const item = tipo === "traslado"
      ? await addItemTraslado(id, traslado_id)
      : await addItemAdHoc(id, descripcion)
    return NextResponse.json({ item })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] POST error:", e)
    return NextResponse.json({ error: "Error al agregar item" }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { item_id } = body
  if (!item_id) {
    return NextResponse.json({ error: "item_id es requerido" }, { status: 400 })
  }

  try {
    await deleteItem(item_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] DELETE error:", e)
    return NextResponse.json({ error: "Error al eliminar item" }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { item_id_a, orden_a, item_id_b, orden_b } = body
  if (!item_id_a || orden_a === undefined || !item_id_b || orden_b === undefined) {
    return NextResponse.json({ error: "item_id_a, orden_a, item_id_b, orden_b required" }, { status: 400 })
  }

  try {
    await swapItemOrder(item_id_a, orden_a, item_id_b, orden_b)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items] PATCH error:", e)
    return NextResponse.json({ error: "Error al reordenar items" }, { status: 500 })
  }
}
