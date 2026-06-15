import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getStats } from "@/lib/data"
import { getConfiguracion } from "@/lib/data/configuracion"

export async function GET(request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const isAdmin = session.user.role === "admin"
  const sucursal_id = isAdmin
    ? (searchParams.get("sucursal_id") || undefined)
    : (session.user.sucursal_id || undefined)

  try {
    const umbrales = await getConfiguracion()
    const stats = await getStats(umbrales, { sucursal_id })
    return NextResponse.json({ stats })
  } catch (e) {
    console.error("[/api/stats] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al obtener stats" }, { status: 500 })
  }
}
