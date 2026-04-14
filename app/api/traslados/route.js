import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTraslados, despacharTraslado, recibirTraslado } from "@/lib/traslados";
import { getSupabaseClient } from "@/lib/supabase-client";

export async function GET(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const sucursal_id = searchParams.get("sucursal_id") || undefined;
    const traslados = await getTraslados({ sucursal_id });
    return NextResponse.json({ traslados });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { traslado_id, accion } = await request.json();

    if (!traslado_id || !["despachar", "recibir"].includes(accion)) {
      return NextResponse.json({ error: "traslado_id y accion (despachar|recibir) requeridos" }, { status: 400 });
    }

    // Validate UUID format (Fix 13)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(traslado_id)) {
      return NextResponse.json({ error: "traslado_id inválido" }, { status: 400 });
    }

    // Fetch traslado to validate permissions
    const { data: trasladoData, error: fetchErr } = await getSupabaseClient()
      .from("traslados")
      .select("sucursal_origen, sucursal_destino")
      .eq("id", traslado_id)
      .single();

    if (fetchErr || !trasladoData) {
      return NextResponse.json({ error: "Traslado no encontrado" }, { status: 404 });
    }

    const isAdmin = session.user?.role === "admin";
    const userSucursal = session.user?.sucursal_id;

    if (accion === "despachar" && !isAdmin && userSucursal !== trasladoData.sucursal_origen) {
      return NextResponse.json({ error: "Solo la sucursal de origen puede despachar" }, { status: 403 });
    }
    if (accion === "recibir" && !isAdmin && userSucursal !== trasladoData.sucursal_destino) {
      return NextResponse.json({ error: "Solo la sucursal de destino puede recibir" }, { status: 403 });
    }

    let traslado;
    if (accion === "despachar") {
      traslado = await despacharTraslado(traslado_id);
    } else {
      traslado = await recibirTraslado(traslado_id, session.user?.id);

      // If this was a return transfer, notify client that order is ready for pickup
      if (traslado.tipo === "retorno") {
        try {
          const { getOrden } = await import("@/lib/data");
          const { formatNumeroOrden } = await import("@/lib/constants");
          const { sendNotification } = await import("@/lib/notifications");
          const orden = await getOrden(traslado.orden_id);
          if (orden?.cliente_email) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
            await sendNotification("LISTO_PARA_RETIRO", {
              clienteEmail: orden.cliente_email,
              clienteNombre: orden.cliente_nombre,
              numeroOrden: formatNumeroOrden(orden.numero_orden),
              tipoArticulo: orden.tipo_articulo,
              trackingUrl: orden.tracking_token ? `${appUrl}/seguimiento/${orden.tracking_token}` : "",
            });
          }
        } catch (e) {
          console.error("[Traslado] Error sending notification after retorno received:", e);
        }
      }
    }

    return NextResponse.json({ traslado });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
