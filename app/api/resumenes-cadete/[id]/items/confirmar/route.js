// app/api/resumenes-cadete/[id]/items/confirmar/route.js
// Confirms a cadete item: updates order state and removes item from resumen
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase-client"
import { cambiarEstado } from "@/lib/data"
import { deleteItem } from "@/lib/cadete"

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
      if (item.subtipo === "llevar_a_taller") {
        // LISTO_PARA_ENVIO → EN_TALLER (cadete delivered to workshop)
        await cambiarEstado(item.orden_id, "EN_TALLER", {
          fecha_envio_taller: new Date().toISOString(),
        })
      } else if (item.subtipo === "retirar_de_taller") {
        // LISTO_EN_TALLER → LISTO_PARA_RETIRO (cadete picked up from workshop)
        await cambiarEstado(item.orden_id, "LISTO_PARA_RETIRO", {
          fecha_listo: new Date().toISOString(),
        })
      }
    }

    // Remove item from resumen
    await deleteItem(item_id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[/api/resumenes-cadete/[id]/items/confirmar] POST error:", e)
    return NextResponse.json({ error: e.message || "Error al confirmar item" }, { status: 500 })
  }
}
