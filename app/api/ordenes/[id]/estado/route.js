import { NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  cambiarEstado,
  asignarTaller,
  registrarPresupuesto,
  aprobarPresupuesto,
  rechazarPresupuesto,
  entregarAlCliente,
} from "@/lib/data"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/ordenes/:id/estado
// body: { action: "cambiar"|"asignar_taller"|"presupuesto"|"aprobar"|"rechazar"|"entregar", ...payload }
export async function POST(request, { params }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { action } = body

  try {
    let orden
    switch (action) {
      case "cambiar":
        orden = await cambiarEstado(id, body.nuevo_estado, body.extras || {})
        break
      case "asignar_taller":
        orden = await asignarTaller(id, body.taller_id)
        break
      case "presupuesto":
        orden = await registrarPresupuesto(id, body.monto, body.moneda, body.monto_taller ?? null)
        break
      case "aprobar":
        orden = await aprobarPresupuesto(id)
        break
      case "rechazar":
        orden = await rechazarPresupuesto(id)
        break
      case "entregar":
        orden = await entregarAlCliente(id, body.monto_final, body.metodo_pago)
        break
      default:
        return NextResponse.json({ error: "action no válido" }, { status: 400 })
    }
    return NextResponse.json({ orden })
  } catch (e) {
    console.error("[/api/ordenes/:id/estado] POST error:", e)
    return NextResponse.json({ error: e.message || "Error al cambiar estado" }, { status: 400 })
  }
}
