import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getOrdenes, crearOrden } from "@/lib/data"

export async function GET(request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const isAdmin = session.user.role === "admin"
  const userSucursal = session.user.sucursal_id

  // Non-admin can only see their own sucursal
  let sucursalParam = searchParams.get("sucursal_id") || undefined
  if (!isAdmin) {
    sucursalParam = userSucursal || undefined
  }

  try {
    const result = await getOrdenes({
      estado: searchParams.get("estado") || undefined,
      taller_id: searchParams.get("taller_id") || undefined,
      busqueda: searchParams.get("busqueda") || undefined,
      incluirEntregados: searchParams.get("incluirEntregados") === "true",
      sucursal_id: sucursalParam,
      page: Number(searchParams.get("page")) || 1,
      limit: Number(searchParams.get("limit")) || 20,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error("[/api/ordenes] GET error:", e)
    return NextResponse.json({ error: e.message || "Error al obtener ordenes" }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  // Non-admin can only create within their own sucursal
  if (session.user.role !== "admin" && body.sucursal_id !== session.user.sucursal_id) {
    return NextResponse.json({ error: "No autorizado para esta sucursal" }, { status: 403 })
  }

  if (!body.empleado_id) {
    return NextResponse.json({ error: "empleado_id es requerido" }, { status: 400 })
  }

  try {
    const orden = await crearOrden(body)
    return NextResponse.json({ orden })
  } catch (e) {
    console.error("[/api/ordenes] POST error:", e)
    return NextResponse.json({ error: e.message || "Error al crear orden" }, { status: 500 })
  }
}
