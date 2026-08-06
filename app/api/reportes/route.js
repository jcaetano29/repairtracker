import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getReportesStats } from "@/lib/data"
import { getConfiguracion } from "@/lib/data/configuracion"

export async function GET(request) {
  const session = await auth()
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const sucursal_id = searchParams.get("sucursal_id") || null

  try {
    const umbrales = await getConfiguracion()
    const stats = await getReportesStats(umbrales, { sucursal_id })
    return NextResponse.json(stats)
  } catch (e) {
    console.error("[/api/reportes] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al obtener reportes" }, { status: 500 })
  }
}
