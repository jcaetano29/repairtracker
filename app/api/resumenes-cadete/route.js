// app/api/resumenes-cadete/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getResumenes, crearResumen, deleteResumen } from "@/lib/cadete"

async function verifyStaff() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role === "admin" || session.user.role === "employee") return session
  return null
}

export async function GET() {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const resumenes = await getResumenes()
    return NextResponse.json({ resumenes })
  } catch (e) {
    console.error("[/api/resumenes-cadete] GET error:", e)
    return NextResponse.json({ error: "Error al obtener resumenes" }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await verifyStaff()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { cadete_id, nombre } = body
  if (!cadete_id) {
    return NextResponse.json({ error: "cadete_id es requerido" }, { status: 400 })
  }

  try {
    const resumen = await crearResumen({
      cadete_id,
      creado_por: session.user.id,
      nombre,
    })
    return NextResponse.json({ resumen })
  } catch (e) {
    console.error("[/api/resumenes-cadete] POST error:", e)
    return NextResponse.json({ error: "Error al crear resumen" }, { status: 500 })
  }
}

export async function DELETE(request) {
  if (!(await verifyStaff())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { resumen_id } = body
  if (!resumen_id) {
    return NextResponse.json({ error: "resumen_id es requerido" }, { status: 400 })
  }

  try {
    await deleteResumen(resumen_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete] DELETE error:", e)
    return NextResponse.json({ error: "Error al eliminar resumen" }, { status: 500 })
  }
}
