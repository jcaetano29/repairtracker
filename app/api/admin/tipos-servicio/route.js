import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { crearTipoServicio } from "@/lib/data"

async function verifyAdmin() {
  const session = await auth()
  return session?.user?.role === "admin" ? session : null
}

export async function POST(request) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.nombre?.trim()) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 })
  if (!body.ciclo_meses) return NextResponse.json({ error: "ciclo_meses es requerido" }, { status: 400 })

  try {
    const tipo = await crearTipoServicio({ nombre: body.nombre.trim(), ciclo_meses: body.ciclo_meses })
    return NextResponse.json({ tipo })
  } catch (e) {
    console.error("[/api/admin/tipos-servicio] POST error:", e)
    return NextResponse.json({ error: e.message || "Error al crear tipo de servicio" }, { status: 500 })
  }
}
