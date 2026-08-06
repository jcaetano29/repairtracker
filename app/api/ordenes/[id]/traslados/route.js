import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getTrasladosByOrden } from "@/lib/traslados"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request, { params }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  try {
    const traslados = await getTrasladosByOrden(id)
    return NextResponse.json({ traslados })
  } catch (e) {
    console.error("[/api/ordenes/:id/traslados] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al obtener traslados" }, { status: 500 })
  }
}
