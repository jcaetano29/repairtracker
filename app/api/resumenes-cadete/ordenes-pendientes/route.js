// app/api/resumenes-cadete/ordenes-pendientes/route.js
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase-client"

export async function GET() {
  const session = await auth()
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "employee")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const supabase = getSupabaseClient()
  const isAdmin = session.user.role === "admin"
  const sucursalId = session.user.sucursal_id

  try {
    // Get orders already assigned to any active resumen (to exclude them)
    const { data: assignedItems } = await supabase
      .from("items_resumen_cadete")
      .select("orden_id, subtipo")
      .eq("tipo", "orden")
      .not("orden_id", "is", null)

    const assignedSet = new Set(
      (assignedItems || []).map((i) => `${i.orden_id}:${i.subtipo}`)
    )

    // "Para retirar de taller" — LISTO_EN_TALLER with external taller
    let retirarQuery = supabase
      .from("v_ordenes_dashboard")
      .select("id, numero_orden, tipo_articulo, marca, modelo, taller_id, taller_nombre, sucursal_nombre, dias_en_estado")
      .eq("estado", "LISTO_EN_TALLER")
      .not("taller_id", "is", null)

    if (!isAdmin && sucursalId) {
      retirarQuery = retirarQuery.eq("sucursal_id", sucursalId)
    }

    const { data: retirarData, error: retirarErr } = await retirarQuery
    if (retirarErr) throw retirarErr

    // "Para llevar a taller" — EN_TALLER with external taller, no active traslado
    let llevarQuery = supabase
      .from("v_ordenes_dashboard")
      .select("id, numero_orden, tipo_articulo, marca, modelo, taller_id, taller_nombre, sucursal_nombre, dias_en_estado, traslado_activo_id")
      .eq("estado", "EN_TALLER")
      .not("taller_id", "is", null)
      .is("traslado_activo_id", null)

    if (!isAdmin && sucursalId) {
      llevarQuery = llevarQuery.eq("sucursal_id", sucursalId)
    }

    const { data: llevarData, error: llevarErr } = await llevarQuery
    if (llevarErr) throw llevarErr

    // Filter out already assigned orders
    const retirar_de_taller = (retirarData || []).filter(
      (o) => !assignedSet.has(`${o.id}:retirar_de_taller`)
    )
    const llevar_a_taller = (llevarData || []).filter(
      (o) => !assignedSet.has(`${o.id}:llevar_a_taller`)
    )

    return NextResponse.json({ retirar_de_taller, llevar_a_taller })
  } catch (e) {
    console.error("[/api/resumenes-cadete/ordenes-pendientes] GET error:", e)
    return NextResponse.json({ error: "Error al obtener ordenes pendientes" }, { status: 500 })
  }
}
