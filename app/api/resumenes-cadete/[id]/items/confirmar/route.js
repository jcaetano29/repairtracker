// app/api/resumenes-cadete/[id]/items/confirmar/route.js
// Confirms a cadete item: updates order state and removes item from resumen
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase-client"
import { cambiarEstado } from "@/lib/data"
import { deleteItem, deactivateIfEmpty } from "@/lib/cadete"

export async function POST(request, { params }) {
  const session = await auth()
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "employee")) {
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
    // Fetch the item to determine what state change to make
    const { data: item, error: fetchErr } = await getSupabaseClient()
      .from("items_resumen_cadete")
      .select("id, tipo, subtipo, orden_id, traslado_id")
      .eq("id", item_id)
      .single()

    if (fetchErr) throw fetchErr
    if (!item) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 })
    }

    if (item.tipo === "orden" && item.orden_id && item.subtipo) {
      // Fetch current order state to validate transition
      const { data: orden, error: ordenErr } = await getSupabaseClient()
        .from("ordenes")
        .select("estado")
        .eq("id", item.orden_id)
        .single()

      if (ordenErr) throw ordenErr

      const expectedStates = item.subtipo === "llevar_a_taller"
        ? ["LISTO_PARA_ENVIO"]
        : ["LISTO_EN_TALLER"]

      if (!expectedStates.includes(orden.estado)) {
        return NextResponse.json({
          error: `No se puede confirmar: la orden esta en estado ${orden.estado}, se esperaba ${expectedStates.join(" o ")}`
        }, { status: 409 })
      }

      if (item.subtipo === "llevar_a_taller") {
        await cambiarEstado(item.orden_id, "EN_TALLER", {
          fecha_envio_taller: new Date().toISOString(),
        })
      } else if (item.subtipo === "retirar_de_taller") {
        await cambiarEstado(item.orden_id, "LISTO_PARA_RETIRO", {
          fecha_listo: new Date().toISOString(),
        })
      }
    }

    // Remove item from resumen
    await deleteItem(item_id)

    // Auto-deactivate resumen if no items left
    const { id: resumenId } = await params
    await deactivateIfEmpty(resumenId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items/confirmar] POST error:", e)
    return NextResponse.json({ error: e.message || "Error al confirmar item" }, { status: 500 })
  }
}
