import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { crearMarca } from "@/lib/data"

async function verifyAdmin() {
  const session = await auth()
  return session?.user?.role === "admin" ? session : null
}

export async function POST(request) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.nombre?.trim()) return NextResponse.json({ error: "nombre es requerido" }, { status: 400 })

  try {
    const marca = await crearMarca(body)
    return NextResponse.json({ marca })
  } catch (e) {
    console.error("[/api/admin/marcas] POST error:", e)
    return NextResponse.json({ error: e.message || "Error al crear marca" }, { status: 500 })
  }
}
